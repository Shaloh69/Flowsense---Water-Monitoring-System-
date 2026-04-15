#include "pressure_sensor.h"
#include "app_config.h"

#include "driver/i2c.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "esp_log.h"

static const char *TAG = "PRESS";

// ── Shared I2C mutex (used by lcd.c too) ───────────────────────────
SemaphoreHandle_t g_i2c_mutex = NULL;

// ── ADS1115 registers ─────────────────────────────────────────────
#define ADS1115_REG_CONVERSION  0x00
#define ADS1115_REG_CONFIG      0x01

#define ADS1115_CFG_HI  0xC3
#define ADS1115_CFG_LO  0x83

#define I2C_TIMEOUT_MS  20

static volatile float s_pressure_psi = 0.0f;

// ── I2C helpers (must be called WITH mutex held) ───────────────────
static esp_err_t ads_write_config(void)
{
    uint8_t buf[3] = { ADS1115_REG_CONFIG, ADS1115_CFG_HI, ADS1115_CFG_LO };
    return i2c_master_write_to_device(I2C_PORT, ADS1115_ADDR,
                                      buf, sizeof(buf),
                                      pdMS_TO_TICKS(I2C_TIMEOUT_MS));
}

static esp_err_t ads_read_raw(int16_t *out)
{
    uint8_t reg = ADS1115_REG_CONVERSION;
    uint8_t raw[2];

    esp_err_t err = i2c_master_write_read_device(I2C_PORT, ADS1115_ADDR,
                                                 &reg, 1, raw, 2,
                                                 pdMS_TO_TICKS(I2C_TIMEOUT_MS));
    if (err == ESP_OK) {
        *out = (int16_t)((raw[0] << 8) | raw[1]);
    }
    return err;
}

// ── PSI conversion ────────────────────────────────────────────────
static float raw_to_psi(int16_t raw)
{
    float v_adc    = raw * (ADS1115_LSB_MV / 1000.0f);
    float v_sensor = v_adc / SIG_SCALE_RATIO;

    float psi = (v_sensor - PRESS_V_MIN) /
                (PRESS_V_MAX - PRESS_V_MIN) * PRESS_PSI_MAX;

    if (psi < 0.0f)          psi = 0.0f;
    if (psi > PRESS_PSI_MAX) psi = PRESS_PSI_MAX;

    return psi;
}

// ── FreeRTOS task ─────────────────────────────────────────────────
static void pressure_task(void *arg)
{
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(PRESSURE_TASK_PERIOD_MS));

        // Start conversion
        xSemaphoreTake(g_i2c_mutex, portMAX_DELAY);
        esp_err_t err = ads_write_config();
        xSemaphoreGive(g_i2c_mutex);

        if (err != ESP_OK) {
            ESP_LOGW(TAG, "ADS config write failed");
            continue;
        }

        // Wait conversion (~8ms)
        vTaskDelay(pdMS_TO_TICKS(10));

        // Read result
        int16_t raw;
        xSemaphoreTake(g_i2c_mutex, portMAX_DELAY);
        err = ads_read_raw(&raw);
        xSemaphoreGive(g_i2c_mutex);

        if (err != ESP_OK) {
            ESP_LOGW(TAG, "ADS read failed");
            continue;
        }

        s_pressure_psi = raw_to_psi(raw);
    }
}

// ── I2C bus recovery — 9 SCL pulses to free a stuck slave ────────
static void i2c_bus_recover(void)
{
    ESP_LOGI(TAG, "I2C bus recovery: toggling SCL x9...");

    // Drive SDA HIGH (not floating) so PCF8574 does not latch garbage data
    gpio_set_direction(I2C_SDA_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(I2C_SDA_GPIO, 1);
    gpio_set_direction(I2C_SCL_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(I2C_SCL_GPIO, 1);
    esp_rom_delay_us(10);

    for (int i = 0; i < 9; i++) {
        gpio_set_level(I2C_SCL_GPIO, 0); esp_rom_delay_us(10);
        gpio_set_level(I2C_SCL_GPIO, 1); esp_rom_delay_us(10);
    }

    // Generate STOP condition: SDA low → SCL high → SDA high
    gpio_set_level(I2C_SDA_GPIO, 0); esp_rom_delay_us(10);
    gpio_set_level(I2C_SCL_GPIO, 1); esp_rom_delay_us(10);
    gpio_set_level(I2C_SDA_GPIO, 1); esp_rom_delay_us(10);

    // Release both lines (I2C driver will reconfigure them)
    gpio_set_direction(I2C_SDA_GPIO, GPIO_MODE_INPUT);
    gpio_set_direction(I2C_SCL_GPIO, GPIO_MODE_INPUT);
    vTaskDelay(pdMS_TO_TICKS(20));
}

// ── Public API ────────────────────────────────────────────────────
esp_err_t pressure_sensor_init(void)
{
    // Create mutex FIRST
    g_i2c_mutex = xSemaphoreCreateMutex();
    if (g_i2c_mutex == NULL) {
        ESP_LOGE(TAG, "Failed to create I2C mutex");
        return ESP_FAIL;
    }

    // Recover bus before installing driver
    i2c_bus_recover();

    // Configure I2C
    i2c_config_t conf = {
        .mode             = I2C_MODE_MASTER,
        .sda_io_num       = I2C_SDA_GPIO,
        .scl_io_num       = I2C_SCL_GPIO,
        .sda_pullup_en    = GPIO_PULLUP_ENABLE,
        .scl_pullup_en    = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_FREQ_HZ,
    };

    esp_err_t err = i2c_param_config(I2C_PORT, &conf);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_param_config failed: %s", esp_err_to_name(err));
        return err;
    }

    err = i2c_driver_install(I2C_PORT, I2C_MODE_MASTER, 0, 0, 0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_driver_install failed: %s", esp_err_to_name(err));
        return err;
    }

    // 🔥 IMPORTANT: allow bus to stabilize
    vTaskDelay(pdMS_TO_TICKS(50));

    // Probe ADS1115 SAFELY
    xSemaphoreTake(g_i2c_mutex, portMAX_DELAY);
    err = ads_write_config();
    xSemaphoreGive(g_i2c_mutex);

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ADS1115 not found at 0x%02X (continuing anyway)", ADS1115_ADDR);
        // Do NOT return — allow LCD to still work
    }

    // Start task regardless
    // Pin to Core 1 — keeps I2C tasks away from WiFi on Core 0
    xTaskCreatePinnedToCore(pressure_task, "pressure_task", 2048, NULL, 5, NULL, 1);

    ESP_LOGI(TAG, "Pressure sensor init complete (SDA=%d SCL=%d)",
             I2C_SDA_GPIO, I2C_SCL_GPIO);

    return ESP_OK;
}

float pressure_sensor_get_psi(void)
{
    return s_pressure_psi;
}