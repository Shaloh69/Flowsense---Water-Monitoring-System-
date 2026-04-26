#pragma once

#include <stdbool.h>
#include "esp_err.h"

// Allocate WiFi stack — call once from app_main(). Does NOT start RF.
esp_err_t wifi_init(void);

// Connect to DEFAULT_WIFI_SSID/PASS in STA mode. Blocks up to 15 s.
// Returns ESP_OK when IP is obtained, ESP_ERR_TIMEOUT otherwise.
// MUST be called from a FreeRTOS task, never from app_main().
esp_err_t wifi_connect(void);

// true if STA is connected and has an IP address.
bool wifi_is_connected(void);

// Current STA IP string — only valid when wifi_is_connected() == true.
const char *wifi_get_ip(void);
