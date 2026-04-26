#include "http_poster.h"
#include "wifi_manager.h"
#include "sensor_snapshot.h"
#include "app_config.h"

#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>
#include <stdio.h>

static const char *TAG = "POST";

#define POST_MAX_RETRIES   3
#define POST_RETRY_DELAY_MS 3000

static bool do_post(const char *url, const char *body, int blen, int post_count)
{
    esp_http_client_config_t config = {
        .url               = url,
        .method            = HTTP_METHOD_POST,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms        = 45000,  // Render free-tier cold start can take up to ~45 s
        .buffer_size       = 512,
        .buffer_size_tx    = 512,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, body, blen);

    esp_err_t err = esp_http_client_perform(client);
    bool ok = false;

    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        if (status == 200) {
            ESP_LOGI(TAG, "[#%d] ✓ HTTP 200", post_count);
            ok = true;
        } else {
            ESP_LOGW(TAG, "[#%d] Server replied HTTP %d", post_count, status);
            ok = true;  // server reachable — don't retry 4xx/5xx
        }
    } else {
        ESP_LOGE(TAG, "[#%d] FAILED: %s", post_count, esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
    return ok;
}

static void poster_task(void *arg)
{
    g_poster_task_handle = xTaskGetCurrentTaskHandle();

    if (strlen(RENDER_SERVER_URL) == 0) {
        ESP_LOGW(TAG, "RENDER_SERVER_URL not set — poster task exiting");
        vTaskDelete(NULL);
        return;
    }

    char url[256];
    snprintf(url, sizeof(url), "%s/api/data", RENDER_SERVER_URL);
    ESP_LOGI(TAG, "HTTP poster ready — POSTing to: %s", url);

    int post_count = 0;

    while (1) {
        // Wait for snap_refresh notification; fall back to timed wake if missed
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(UPDATE_INTERVAL_MS + 2000));

        if (!wifi_is_connected()) {
            ESP_LOGW(TAG, "WiFi not connected — skipping POST");
            continue;
        }

        post_count++;

        char body[256];
        int  blen = snprintf(body, sizeof(body),
            "{\"flow_in_m3h\":%.4f,\"flow_out_m3h\":%.4f,"
            "\"volume_in_m3\":%.4f,\"volume_out_m3\":%.4f,"
            "\"pressure_psi\":%.2f}",
            g_snap.flow_in_m3h,
            g_snap.flow_out_m3h,
            g_snap.volume_in_m3,
            g_snap.volume_out_m3,
            g_snap.pressure_psi);

        ESP_LOGI(TAG, "[#%d] POST → %s  body: %s", post_count, url, body);

        // ── Retry loop ────────────────────────────────────────────────────────
        bool sent = false;
        for (int attempt = 1; attempt <= POST_MAX_RETRIES && !sent; attempt++) {
            if (attempt > 1) {
                ESP_LOGW(TAG, "[#%d] retry %d/%d in %d ms...",
                         post_count, attempt, POST_MAX_RETRIES, POST_RETRY_DELAY_MS);
                vTaskDelay(pdMS_TO_TICKS(POST_RETRY_DELAY_MS));

                if (!wifi_is_connected()) {
                    ESP_LOGW(TAG, "[#%d] WiFi lost mid-retry — aborting", post_count);
                    break;
                }
            }
            sent = do_post(url, body, blen, post_count);
        }

        if (!sent) {
            ESP_LOGE(TAG, "[#%d] All %d attempts failed — will retry next cycle",
                     post_count, POST_MAX_RETRIES);
        }
    }
}

void http_poster_start(void)
{
    ESP_LOGI(TAG, "Starting HTTP poster task (stack=8192, prio=3)");
    xTaskCreate(poster_task, "http_poster", 8192, NULL, 3, NULL);
}
