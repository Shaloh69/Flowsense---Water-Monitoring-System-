#pragma once
#include "esp_err.h"
#include <stdbool.h>

/**
 * Initialise WiFi in the correct mode:
 *   - No saved credentials  → AP-only ("Flowsense") + provisioning page at /setup
 *   - Saved credentials     → APSTA: "Flowsense" hotspot stays up, STA connects to
 *                             saved router for internet access
 *
 * Also registers all WiFi/IP events, starts DNS, and starts the HTTP server.
 * Call once from app_main after nvs_flash_init().
 */
esp_err_t wifi_manager_init(void);

/** True once the STA leg has obtained an IP from the router. */
bool wifi_manager_is_sta_connected(void);

/** Persist credentials to NVS and restart (called from web provisioning handler). */
esp_err_t wifi_manager_save_and_restart(const char *ssid, const char *pass);
