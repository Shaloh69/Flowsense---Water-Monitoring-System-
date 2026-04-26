#pragma once

#include <stdint.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// Single snapshot of all sensor readings — refreshed every UPDATE_INTERVAL_MS.
// Both lcd_task and poster_task read from here so they always show the same values.
typedef struct {
    float flow_in_m3h;
    float flow_out_m3h;
    float volume_in_m3;
    float volume_out_m3;
    float pressure_psi;
} sensor_snapshot_t;

extern volatile sensor_snapshot_t g_snap;

// task_sensor_refresh notifies these handles after every g_snap update.
// lcd.c and http_poster.c register themselves here at task start.
extern TaskHandle_t g_lcd_task_handle;
extern TaskHandle_t g_poster_task_handle;
