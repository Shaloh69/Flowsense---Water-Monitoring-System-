#pragma once

/**
 * Start the background task that POSTs sensor data to the Render server
 * every 2 seconds whenever wifi_manager_is_sta_connected() is true.
 * Call once after wifi_manager_init().
 */
void http_poster_start(void);
