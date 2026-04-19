#include "http_poster.h"
#include "wifi_manager.h"
#include "flow_sensor.h"
#include "pressure_sensor.h"
#include "app_config.h"

#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>
#include <stdio.h>

static const char *TAG = "POST";

#define POST_INTERVAL_MS  UPDATE_INTERVAL_MS

static void poster_task(void *arg)
{
    if (strlen(RENDER_SERVER_URL) == 0) {
        ESP_LOGW(TAG, "RENDER_SERVER_URL not set — poster task exiting");
        vTaskDelete(NULL);
        return;
    }

    char url[256];
    snprintf(url, sizeof(url), "%s/api/data", RENDER_SERVER_URL);
    ESP_LOGI(TAG, "HTTP poster ready — will POST to: %s every %d ms", url, POST_INTERVAL_MS);

    int post_count = 0;

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(POST_INTERVAL_MS));

        // ── WiFi gate ─────────────────────────────────────────────────────────
        if (!wifi_is_connected()) {
            ESP_LOGW(TAG, "WiFi not connected — skipping POST (will retry in %d ms)",
                     POST_INTERVAL_MS);
            continue;
        }

        post_count++;

        // ── Build JSON body ───────────────────────────────────────────────────
        char body[256];
        int  blen = snprintf(body, sizeof(body),
            "{\"flow_in_m3h\":%.4f,\"flow_out_m3h\":%.4f,"
            "\"volume_in_m3\":%.4f,\"volume_out_m3\":%.4f,"
            "\"pressure_psi\":%.2f}",
            flow_sensor_get_rate_lpm(FLOW_CH_IN)       * LPM_TO_M3MIN,
            flow_sensor_get_rate_lpm(FLOW_CH_OUT)      * LPM_TO_M3MIN,
            flow_sensor_get_volume_liters(FLOW_CH_IN)  * L_TO_M3,
            flow_sensor_get_volume_liters(FLOW_CH_OUT) * L_TO_M3,
            pressure_sensor_get_psi());

        ESP_LOGI(TAG, "[#%d] POST → %s", post_count, url);
        ESP_LOGI(TAG, "[#%d] Body: %s", post_count, body);

        // ── HTTP request ──────────────────────────────────────────────────────
        esp_http_client_config_t config = {
            .url               = url,
            .method            = HTTP_METHOD_POST,
            .crt_bundle_attach = esp_crt_bundle_attach,
            .timeout_ms        = 15000,
            .buffer_size       = 512,
            .buffer_size_tx    = 512,
        };

        esp_http_client_handle_t client = esp_http_client_init(&config);
        esp_http_client_set_header(client, "Content-Type", "application/json");
        esp_http_client_set_post_field(client, body, blen);

        esp_err_t err = esp_http_client_perform(client);
        if (err == ESP_OK) {
            int status = esp_http_client_get_status_code(client);
            if (status == 200) {
                ESP_LOGI(TAG, "[#%d] ✓ Server accepted — HTTP 200", post_count);
            } else {
                ESP_LOGW(TAG, "[#%d] Server replied HTTP %d", post_count, status);
            }
        } else {
            ESP_LOGE(TAG, "[#%d] POST FAILED: %s  (IP: %s  URL: %s)",
                     post_count, esp_err_to_name(err), wifi_get_ip(), url);
        }

        esp_http_client_cleanup(client);
    }
}

void http_poster_start(void)
{
    ESP_LOGI(TAG, "Starting HTTP poster task (stack=8192, prio=4)");
    xTaskCreate(poster_task, "http_poster", 8192, NULL, 4, NULL);
}
