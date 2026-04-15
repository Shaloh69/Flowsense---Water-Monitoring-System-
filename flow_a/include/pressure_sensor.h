#pragma once

#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

/**
 * Shared I2C bus mutex.
 * Both pressure_sensor.c and lcd.c must acquire this before any i2c_* call
 * to prevent bus collisions between their FreeRTOS tasks.
 * Created in pressure_sensor_init().
 */
extern SemaphoreHandle_t g_i2c_mutex;

/**
 * @brief Initialize the I2C bus and ADS1115 ADC module.
 * @return ESP_OK on success, ESP_FAIL if the ADS1115 does not respond.
 */
esp_err_t pressure_sensor_init(void);

/**
 * @brief Get the latest pressure reading in PSI.
 *        Updated every PRESSURE_TASK_PERIOD_MS by a background task.
 */
float pressure_sensor_get_psi(void);
