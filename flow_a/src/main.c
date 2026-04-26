#include "app_config.h"
#include "wifi_manager.h"
#include "flow_sensor.h"
#include "pressure_sensor.h"
#include "http_poster.h"
#include "lcd.h"
#include "sensor_snapshot.h"

#include "nvs_flash.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "APP";

// ── Task: Sensor snapshot refresh ────────────────────────────────────────────
// Reads ALL sensors once every UPDATE_INTERVAL_MS into g_snap.
// lcd_task and poster_task both read from g_snap — same values, same moment.

static void task_sensor_refresh(void *arg)
{
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(UPDATE_INTERVAL_MS));

        g_snap.flow_in_m3h   = flow_sensor_get_rate_lpm(FLOW_CH_IN)       * LPM_TO_M3H;
        g_snap.flow_out_m3h  = flow_sensor_get_rate_lpm(FLOW_CH_OUT)      * LPM_TO_M3H;
        g_snap.volume_in_m3  = flow_sensor_get_volume_liters(FLOW_CH_IN)  * L_TO_M3;
        g_snap.volume_out_m3 = flow_sensor_get_volume_liters(FLOW_CH_OUT) * L_TO_M3;
        g_snap.pressure_psi  = pressure_sensor_get_psi();

        ESP_LOGI(TAG, "SNAP  IN:%.4f m3/h  OUT:%.4f m3/h  Vi:%.4f m3  Vo:%.4f m3  PRES:%.2f PSI",
                 g_snap.flow_in_m3h, g_snap.flow_out_m3h,
                 g_snap.volume_in_m3, g_snap.volume_out_m3,
                 g_snap.pressure_psi);

        // Notify LCD and HTTP poster — they display/send this exact snapshot
        if (g_lcd_task_handle)    xTaskNotifyGive(g_lcd_task_handle);
        if (g_poster_task_handle) xTaskNotifyGive(g_poster_task_handle);
    }
}

// ── Task: WiFi manager ────────────────────────────────────────────────────────
// wifi_connect() called from task context — never from app_main — so that
// esp_wifi_start() / phy_init fires with the scheduler already running.
// No provisioning AP. Retries indefinitely until "Team Flores 2.4" is reachable.

static void task_wifi_manager(void *arg)
{
    bool server_started = false;

    // Give power rail time to stabilise before RF init (important on charger startup)
    vTaskDelay(pdMS_TO_TICKS(2000));

    // Initial connect — retry indefinitely until we get an IP
    while (1) {
        ESP_LOGI(TAG, "Connecting to \"%s\" ...", DEFAULT_WIFI_SSID);
        esp_err_t err = wifi_connect();
        if (err == ESP_OK) {
            ESP_LOGI(TAG, "WiFi OK — IP: %s", wifi_get_ip());
            if (!server_started) {
                http_poster_start();
                server_started = true;
            }
            break;
        } else if (err == ESP_ERR_TIMEOUT) {
            ESP_LOGW(TAG, "WiFi TIMEOUT — SSID \"%s\" not in range or wrong password — retrying in 15 s",
                     DEFAULT_WIFI_SSID);
        } else {
            ESP_LOGW(TAG, "WiFi FAILED (%s) — retrying in 15 s", esp_err_to_name(err));
        }
        vTaskDelay(pdMS_TO_TICKS(15000));
    }

    // Reconnect loop
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(WIFI_RECONNECT_MS));

        if (wifi_is_connected()) {
            ESP_LOGI(TAG, "WiFi still connected — IP: %s", wifi_get_ip());
        } else {
            ESP_LOGW(TAG, "WiFi not connected — reconnecting...");
            esp_err_t err = wifi_connect();
            if (err == ESP_OK) {
                ESP_LOGI(TAG, "Reconnected — IP: %s", wifi_get_ip());
                if (!server_started) {
                    http_poster_start();
                    server_started = true;
                }
            } else {
                ESP_LOGW(TAG, "Reconnect failed (%s) — will retry in %d s",
                         esp_err_to_name(err), WIFI_RECONNECT_MS / 1000);
            }
        }
    }
}

// ── app_main ──────────────────────────────────────────────────────────────────

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
    ESP_ERROR_CHECK(wifi_init());

    // 6. Create tasks
    xTaskCreate(task_sensor_refresh, "snap_refresh", 2048, NULL, 4, NULL);
    xTaskCreate(task_wifi_manager,   "wifi_mgr",     4096, NULL, 3, NULL);

    ESP_LOGI(TAG, "All tasks running");
}
