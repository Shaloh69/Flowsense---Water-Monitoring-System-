#include "app_config.h"
#include "wifi_manager.h"
#include "flow_sensor.h"
#include "pressure_sensor.h"
#include "http_poster.h"
#include "lcd.h"

#include "nvs_flash.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "APP";

// ── Task: WiFi manager ────────────────────────────────────────────────────────
// Mirrors BlueWatt's task_wifi_manager exactly.
// wifi_connect() is called from here — never from app_main — so that
// esp_wifi_start() / phy_init fires from a FreeRTOS task context with the
// idle task already running and all other tasks quiescent.

static void task_wifi_manager(void *arg)
{
    bool server_started = false;

    ESP_LOGI(TAG, "task_wifi_manager: calling wifi_connect()");

    esp_err_t err = wifi_connect();
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "WiFi connected — IP: %s", wifi_get_ip());
        http_poster_start();
        server_started = true;
    } else {
        ESP_LOGW(TAG, "WiFi connect failed — starting provisioning AP");
        wifi_start_provisioning_mode();
        // Stay in provisioning until the user saves credentials (causes reboot)
        while (1) vTaskDelay(pdMS_TO_TICKS(10000));
    }

    // Reconnect loop
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(WIFI_RECONNECT_MS));

        if (!wifi_is_connected()) {
            ESP_LOGW(TAG, "WiFi lost — reconnecting...");
            err = wifi_connect();
            if (err == ESP_OK) {
                ESP_LOGI(TAG, "Reconnected — IP: %s", wifi_get_ip());
                if (!server_started) {
                    http_poster_start();
                    server_started = true;
                }
            } else {
                ESP_LOGW(TAG, "Reconnect failed — will retry in %d s",
                         WIFI_RECONNECT_MS / 1000);
            }
        }
    }
}

// ── Task: Sensor log ──────────────────────────────────────────────────────────
// Periodically logs all sensor values to serial — useful for debugging
// without needing to open the web dashboard.

static void task_sensor_log(void *arg)
{
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(5000));

        float fin_m3min  = flow_sensor_get_rate_lpm(FLOW_CH_IN)       * LPM_TO_M3MIN;
        float fout_m3min = flow_sensor_get_rate_lpm(FLOW_CH_OUT)      * LPM_TO_M3MIN;
        float vin_m3     = flow_sensor_get_volume_liters(FLOW_CH_IN)  * L_TO_M3;
        float vout_m3    = flow_sensor_get_volume_liters(FLOW_CH_OUT) * L_TO_M3;
        float psi        = pressure_sensor_get_psi();

        ESP_LOGI(TAG, "IN:%.5f m3/min  OUT:%.5f m3/min  VolIN:%.4f m3  VolOUT:%.4f m3  PRES:%.2f PSI",
                 fin_m3min, fout_m3min, vin_m3, vout_m3, psi);
    }
}

// ── app_main ──────────────────────────────────────────────────────────────────
// Mirrors BlueWatt's app_main structure:
//   1. NVS
//   2. Hardware peripherals
//   3. wifi_init()  ← allocates WiFi stack only, NO RF start
//   4. Create tasks  ← phy_init fires later inside task_wifi_manager

void app_main(void)
{
    ESP_LOGI(TAG, "Flowsense v1 — Water Monitoring System");

    // 1. NVS flash
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS: erasing and reinitialising");
        nvs_flash_erase();
        nvs_flash_init();
    }
    ESP_LOGI(TAG, "NVS init OK");

    // 2. Flow sensors (GPIO ISR only)
    flow_sensor_init();

    // 3. Pressure sensor — installs I2C driver and creates shared mutex
    err = pressure_sensor_init();
    if (err != ESP_OK)
        ESP_LOGW(TAG, "Pressure sensor init failed — reads will return 0.0 PSI");

    // 4. LCD — must follow pressure_sensor_init (shared I2C + mutex)
    lcd_init();

    // 5. WiFi stack allocation — NO RF start here
    //    phy_init fires inside wifi_connect() called from task_wifi_manager.
    //    This matches BlueWatt's wifi_init() in app_main pattern exactly.
    ESP_ERROR_CHECK(wifi_init());

    // 6. Create tasks
    xTaskCreate(task_wifi_manager, "wifi_mgr",    4096, NULL, 3, NULL);
    xTaskCreate(task_sensor_log,   "sensor_log",  2048, NULL, 2, NULL);

    ESP_LOGI(TAG, "All tasks running");
}
