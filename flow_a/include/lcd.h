#pragma once

#include <stdint.h>

/**
 * @brief Probe I2C bus for PCF8574 (0x27) or PCF8574A (0x3F),
 *        run the HD44780 4-bit init sequence on a single 20x4 LCD,
 *        then start a FreeRTOS task that refreshes all 4 rows every 1 s:
 *          Row 0 — inlet  flow rate  (m³/h)
 *          Row 1 — outlet flow rate  (m³/h)
 *          Row 2 — cumulative volume IN / OUT (L)
 *          Row 3 — line pressure (PSI)
 *
 *        Must be called AFTER pressure_sensor_init() has installed
 *        the I2C driver (shared bus).
 */
void lcd_init(void);
