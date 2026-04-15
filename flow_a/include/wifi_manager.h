#pragma once

#include <stdbool.h>
#include "esp_err.h"

/**
 * @brief Allocate WiFi stack and register event handlers.
 *        Does NOT start RF hardware — phy_init has NOT run after this returns.
 *        Call once from app_main(), same as BlueWatt's wifi_init().
 */
esp_err_t wifi_init(void);

/**
 * @brief Connect to WiFi in STA-only mode.
 *        This is where esp_wifi_start() and phy_init fire.
 *        MUST be called from a FreeRTOS task, never from app_main() directly.
 *        Uses NVS credentials if saved, otherwise falls back to DEFAULT_WIFI_SSID/PASS.
 * @return ESP_OK if IP obtained, ESP_FAIL on auth error, ESP_ERR_TIMEOUT on timeout.
 */
esp_err_t wifi_connect(void);

/**
 * @brief Stop STA and start AP-only provisioning mode.
 *        Brings up the "Flowsense" hotspot, DNS redirect, and web portal at http://AP_IP/
 *        Call when wifi_connect() fails after max retries.
 */
void wifi_start_provisioning_mode(void);

/**
 * @brief Return true if STA is connected and has an IP address.
 */
bool wifi_is_connected(void);

/**
 * @brief Return the current STA IP address string (e.g. "192.168.1.42").
 *        Only valid when wifi_is_connected() == true.
 */
const char *wifi_get_ip(void);

/**
 * @brief Save WiFi credentials to NVS and schedule a reboot in 1.5 s.
 *        Called by web_server.c when the user submits the /setup form.
 */
esp_err_t wifi_manager_save_and_restart(const char *ssid, const char *pass);
