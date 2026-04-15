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
#include "soc/rtc_cntl_reg.h"
#include "soc/soc.h"

static const char *TAG = "APP";

// ── WiFi starts in its own task, 4 s after boot ───────────────────
// Reason: phy_init draws ~400 mA. Starting WiFi only after all other
// init is done and the FreeRTOS idle task is running keeps every other
// peripheral quiet during the RF power spike, minimising total current.
static void wifi_task(void *arg)
{
    vTaskDelay(pdMS_TO_TICKS(4000));   // 4 s — let power rail fully settle
    wifi_manager_init();
    http_poster_start();
    ESP_LOGI(TAG, "Flowsense ready — hotspot: \"%s\"  portal: http://" AP_IP "/",
             AP_SSID);
    vTaskDelete(NULL);
}

void app_main(void)
{
    // ── Disable brownout detector ─────────────────────────────────
    // USB / HLK-PM01 cannot supply the ~400 mA WiFi RF peak without a
    // bulk capacitor. BOD fires and resets the chip before NVS can save
    // calibration data, creating an infinite reboot loop.
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

    // 1. NVS
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    // 2. Flow sensors (GPIO ISR only — no I2C)
    flow_sensor_init();

    // 3. Pressure sensor — installs I2C driver + creates shared mutex
    err = pressure_sensor_init();
    if (err != ESP_OK)
        ESP_LOGW(TAG, "Pressure sensor init failed — reads will be 0.0 PSI");

    // 4. LCD — must follow pressure_sensor_init (shared I2C + mutex)
    lcd_init();

    // 5. WiFi deferred — starts 4 s later from its own task so the
    //    FreeRTOS idle task is running and all other tasks are quiescent
    //    when phy_init fires up the RF hardware.
    xTaskCreate(wifi_task, "wifi_task", 4096, NULL, 5, NULL);
}
