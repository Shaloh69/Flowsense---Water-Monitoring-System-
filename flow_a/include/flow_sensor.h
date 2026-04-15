#pragma once

#include <stdint.h>

// Channel indices
#define FLOW_CH_IN  0
#define FLOW_CH_OUT 1

/**
 * @brief Initialize both YF-S201 flow sensors.
 *        Configures GPIO interrupts and starts the flow computation task.
 *        Must be called after the GPIO ISR service is installed.
 */
void flow_sensor_init(void);

/**
 * @brief Get the current flow rate in litres per minute.
 * @param channel  FLOW_CH_IN or FLOW_CH_OUT
 */
float flow_sensor_get_rate_lpm(int channel);

/**
 * @brief Get the cumulative volume in litres since boot (or last reset).
 * @param channel  FLOW_CH_IN or FLOW_CH_OUT
 */
float flow_sensor_get_volume_liters(int channel);

/**
 * @brief Reset cumulative volume counter.
 * @param channel  FLOW_CH_IN or FLOW_CH_OUT
 */
void flow_sensor_reset_volume(int channel);
