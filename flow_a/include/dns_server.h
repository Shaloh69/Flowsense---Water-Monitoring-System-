#pragma once

/**
 * @brief Start the DNS spoof server.
 *        Listens on UDP port 53 and responds to ALL A-record queries
 *        with the ESP32's AP gateway IP (192.168.4.1).
 *        This forces captive-portal detection on Android, iOS, and Windows
 *        so the phone automatically pops up the web dashboard.
 */
void dns_server_start(void);
