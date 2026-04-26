#include "sensor_snapshot.h"

volatile sensor_snapshot_t g_snap          = {0};
TaskHandle_t               g_lcd_task_handle    = NULL;
TaskHandle_t               g_poster_task_handle = NULL;
