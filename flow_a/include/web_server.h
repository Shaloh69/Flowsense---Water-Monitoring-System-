#pragma once

/**
 * @brief Start the embedded HTTP server.
 *        Registers GET / (dashboard) and GET /data (JSON API).
 *        Must be called after WiFi is connected.
 */
void web_server_start(void);
