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

// ── POST interval — defined in app_config.h as UPDATE_INTERVAL_MS ────────────
#define POST_INTERVAL_MS  UPDATE_INTERVAL_MS

// ── Task ─────────────────────────────────────────────────────────────────────
static void poster_task(void *arg)
{
    // If no server URL is configured, just exit
    if (strlen(RENDER_SERVER_URL) == 0) {
        ESP_LOGW(TAG, "RENDER_SERVER_URL not set — poster task exiting");
        vTaskDelete(NULL);
        return;
    }

    ESP_LOGI(TAG, "HTTP poster started → %s/api/data", RENDER_SERVER_URL);

    char url[256];
    snprintf(url, sizeof(url), "%s/api/data", RENDER_SERVER_URL);

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(POST_INTERVAL_MS));

        if (!wifi_is_connected()) continue;

        // Build JSON body
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

        ESP_LOGD(TAG, "POST body: %s", body);

        // HTTP client config — timeout raised to 15 s to survive Render cold-start
        esp_http_client_config_t config = {
            .url                = url,
            .method             = HTTP_METHOD_POST,
            .crt_bundle_attach  = esp_crt_bundle_attach,
            .timeout_ms         = 15000,
            .buffer_size        = 512,
            .buffer_size_tx     = 512,
        };

        esp_http_client_handle_t client = esp_http_client_init(&config);
        esp_http_client_set_header(client, "Content-Type", "application/json");
        esp_http_client_set_post_field(client, body, blen);

        esp_err_t err = esp_http_client_perform(client);
        if (err == ESP_OK) {
            int status = esp_http_client_get_status_code(client);
            if (status == 200) {
                ESP_LOGI(TAG, "OK 200 — data accepted by server");
            } else {
                ESP_LOGW(TAG, "Server replied HTTP %d", status);
            }
        } else {
            ESP_LOGW(TAG, "POST failed (%s) — will retry in %d ms",
                     esp_err_to_name(err), POST_INTERVAL_MS);
        }

        esp_http_client_cleanup(client);
    }
}

void http_poster_start(void)
{
    xTaskCreate(poster_task, "http_poster", 8192, NULL, 4, NULL);
}
