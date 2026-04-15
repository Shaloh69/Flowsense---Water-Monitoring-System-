#include "web_server.h"
#include "wifi_manager.h"
#include "flow_sensor.h"
#include "pressure_sensor.h"
#include "app_config.h"

#include "esp_http_server.h"
#include "esp_log.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static const char *TAG = "WEB";

#define REDIRECT_URL "http://" AP_IP "/"

// ── Dashboard HTML ────────────────────────────────────────────────────────────
static const char DASHBOARD_HTML[] =
    "<!DOCTYPE html>"
    "<html lang=\"en\">"
    "<head>"
    "<meta charset=\"UTF-8\">"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>Flowsense Monitor</title>"
    "<style>"
    "*{box-sizing:border-box;margin:0;padding:0}"
    "body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;"
    "     display:flex;flex-direction:column;align-items:center;padding:2rem}"
    "h1{font-size:1.6rem;margin-bottom:1.5rem;color:#38bdf8;letter-spacing:.05em}"
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));"
    "      gap:1rem;width:100%;max-width:860px}"
    ".card{background:#1e293b;border-radius:12px;padding:1.25rem;text-align:center;"
    "      border:1px solid #334155}"
    ".card .label{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;"
    "             color:#94a3b8;margin-bottom:.5rem}"
    ".card .value{font-size:2rem;font-weight:700;color:#f1f5f9}"
    ".card .unit{font-size:.8rem;color:#64748b;margin-top:.25rem}"
    ".status{margin-top:1.25rem;font-size:.75rem;color:#475569}"
    "</style>"
    "</head>"
    "<body>"
    "<h1>Flowsense Live Monitor</h1>"
    "<div class=\"grid\">"
    "<div class=\"card\">"
    "<div class=\"label\">Inlet Flow Rate</div>"
    "<div class=\"value\" id=\"flow_in_m3min\">--</div>"
    "<div class=\"unit\">m&#179; / min</div></div>"
    "<div class=\"card\">"
    "<div class=\"label\">Outlet Flow Rate</div>"
    "<div class=\"value\" id=\"flow_out_m3min\">--</div>"
    "<div class=\"unit\">m&#179; / min</div></div>"
    "<div class=\"card\">"
    "<div class=\"label\">Inlet Volume</div>"
    "<div class=\"value\" id=\"volume_in_m3\">--</div>"
    "<div class=\"unit\">m&#179;</div></div>"
    "<div class=\"card\">"
    "<div class=\"label\">Outlet Volume</div>"
    "<div class=\"value\" id=\"volume_out_m3\">--</div>"
    "<div class=\"unit\">m&#179;</div></div>"
    "<div class=\"card\">"
    "<div class=\"label\">Line Pressure</div>"
    "<div class=\"value\" id=\"pressure_psi\">--</div>"
    "<div class=\"unit\">PSI</div></div>"
    "</div>"
    "<div class=\"status\" id=\"status\">Connecting...</div>"
    "<script>"
    "function fmt(v){return parseFloat(v).toFixed(2)}"
    "function update(){"
    "  fetch('/data').then(r=>r.json()).then(d=>{"
    "    document.getElementById('flow_in_m3min').textContent =fmt(d.flow_in_m3min);"
    "    document.getElementById('flow_out_m3min').textContent=fmt(d.flow_out_m3min);"
    "    document.getElementById('volume_in_m3').textContent =fmt(d.volume_in_m3);"
    "    document.getElementById('volume_out_m3').textContent=fmt(d.volume_out_m3);"
    "    document.getElementById('pressure_psi').textContent =fmt(d.pressure_psi);"
    "    document.getElementById('status').textContent='Updated: '+new Date().toLocaleTimeString();"
    "  }).catch(()=>{document.getElementById('status').textContent='Reconnecting...';});"
    "}"
    "update();setInterval(update,2000);"
    "</script>"
    "</body></html>";

// ── Captive-portal redirect ───────────────────────────────────────────────────
static esp_err_t redirect_to_portal(httpd_req_t *req)
{
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", REDIRECT_URL);
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_send(req, "Redirecting...", HTTPD_RESP_USE_STRLEN);
}

static esp_err_t handler_root(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, DASHBOARD_HTML, HTTPD_RESP_USE_STRLEN);
}

// ── JSON data endpoint (all values in US gallons / PSI) ──────────────────────
static esp_err_t handler_data(httpd_req_t *req)
{
    char buf[220];
    snprintf(buf, sizeof(buf),
        "{\"flow_in_m3min\":%.6f,\"flow_out_m3min\":%.6f,"
        "\"volume_in_m3\":%.5f,\"volume_out_m3\":%.5f,"
        "\"pressure_psi\":%.2f}",
        flow_sensor_get_rate_lpm(FLOW_CH_IN)       * LPM_TO_M3MIN,
        flow_sensor_get_rate_lpm(FLOW_CH_OUT)      * LPM_TO_M3MIN,
        flow_sensor_get_volume_liters(FLOW_CH_IN)  * L_TO_M3,
        flow_sensor_get_volume_liters(FLOW_CH_OUT) * L_TO_M3,
        pressure_sensor_get_psi());

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, buf, HTTPD_RESP_USE_STRLEN);
}

// ── Captive portal detection handlers ────────────────────────────────────────
static esp_err_t handler_captive(httpd_req_t *req)   { return redirect_to_portal(req); }
static esp_err_t handler_404(httpd_req_t *req, httpd_err_code_t err)
                                                       { return redirect_to_portal(req); }

// ── /setup  GET — WiFi provisioning form ────────────────────────────────────
static const char SETUP_HTML[] =
    "<!DOCTYPE html><html lang='en'><head>"
    "<meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Flowsense Setup</title>"
    "<style>"
    "*{box-sizing:border-box;margin:0;padding:0}"
    "body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;"
    "     display:flex;justify-content:center;align-items:center;min-height:100vh}"
    ".card{background:#1e293b;border-radius:16px;padding:2rem;width:100%;"
    "      max-width:400px;border:1px solid #334155;margin:1rem}"
    ".logo{display:flex;align-items:center;gap:.75rem;margin-bottom:1.5rem}"
    ".logo-icon{width:40px;height:40px;background:#2563eb;border-radius:10px;"
    "            display:flex;align-items:center;justify-content:center}"
    "h1{font-size:1.25rem;font-weight:700}p{font-size:.85rem;color:#94a3b8;margin:.5rem 0 1.5rem}"
    "label{font-size:.75rem;color:#94a3b8;display:block;margin-bottom:.3rem}"
    "input{width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;"
    "      padding:.65rem .9rem;color:#fff;font-size:.95rem;margin-bottom:1rem}"
    "input:focus{outline:none;border-color:#2563eb}"
    "button{width:100%;background:#2563eb;color:#fff;border:none;border-radius:8px;"
    "       padding:.8rem;font-size:1rem;cursor:pointer;font-weight:600}"
    "button:hover{background:#1d4ed8}"
    ".note{font-size:.72rem;color:#475569;margin-top:1rem;text-align:center;line-height:1.5}"
    "</style></head><body>"
    "<div class='card'>"
    "<div class='logo'>"
    "<div class='logo-icon'><svg width='22' height='22' fill='none' stroke='#fff'"
    " stroke-width='2' viewBox='0 0 24 24'><path stroke-linecap='round' stroke-linejoin='round'"
    " d='M19 14a7 7 0 11-14 0c0-4.418 5-10 7-10s7 5.582 7 10z'/></svg></div>"
    "<h1>Flowsense Setup</h1></div>"
    "<p>Enter your WiFi credentials to enable cloud monitoring via Render.</p>"
    "<form method='POST' action='/setup'>"
    "<label>WiFi Network (SSID)</label>"
    "<input name='ssid' type='text' placeholder='YourNetworkName' required autocomplete='off'>"
    "<label>Password</label>"
    "<input name='pass' type='password' placeholder='WiFi Password'>"
    "<button type='submit'>Save &amp; Connect</button>"
    "</form>"
    "<p class='note'>The device will reboot after saving.<br>"
    "Reconnect to &ldquo;Flowsense&rdquo; in ~5 seconds.</p>"
    "</div></body></html>";

static const char SETUP_OK_HTML[] =
    "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Saved!</title>"
    "<style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;"
    "display:flex;justify-content:center;align-items:center;min-height:100vh}"
    ".card{background:#1e293b;border-radius:16px;padding:2rem;text-align:center;"
    "max-width:380px;border:1px solid #334155;margin:1rem}"
    "h2{color:#4ade80;margin-bottom:.75rem} p{color:#94a3b8;font-size:.9rem}</style>"
    "</head><body><div class='card'>"
    "<h2>&#10003; Credentials Saved</h2>"
    "<p>The device is rebooting and will connect to your WiFi.<br><br>"
    "Reconnect to <strong>Flowsense</strong> and open<br>"
    "<strong>http://" AP_IP "/</strong> for the dashboard.</p>"
    "</div></body></html>";

// ── URL-decode helper (in-place) ─────────────────────────────────────────────
static void url_decode(char *buf)
{
    char *src = buf, *dst = buf;
    while (*src) {
        if (*src == '+') {
            *dst++ = ' ';
            src++;
        } else if (*src == '%' && src[1] && src[2]) {
            char h[3] = { src[1], src[2], 0 };
            *dst++ = (char)strtol(h, NULL, 16);
            src += 3;
        } else {
            *dst++ = *src++;
        }
    }
    *dst = '\0';
}

static esp_err_t handler_setup_get(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, SETUP_HTML, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t handler_setup_post(httpd_req_t *req)
{
    char body[256] = {0};
    int  received  = httpd_req_recv(req, body, sizeof(body) - 1);
    if (received <= 0) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Empty body");
        return ESP_FAIL;
    }
    body[received] = '\0';

    // Parse ssid=...&pass=...
    char ssid[64] = {0};
    char pass[64] = {0};

    char *p = strstr(body, "ssid=");
    if (p) {
        p += 5;
        char *end = strchr(p, '&');
        size_t len = end ? (size_t)(end - p) : strlen(p);
        if (len >= sizeof(ssid)) len = sizeof(ssid) - 1;
        memcpy(ssid, p, len);
        url_decode(ssid);
    }

    p = strstr(body, "pass=");
    if (p) {
        p += 5;
        char *end = strchr(p, '&');
        size_t len = end ? (size_t)(end - p) : strlen(p);
        if (len >= sizeof(pass)) len = sizeof(pass) - 1;
        memcpy(pass, p, len);
        url_decode(pass);
    }

    if (ssid[0] == '\0') {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "SSID required");
        return ESP_FAIL;
    }

    // Send success page before rebooting
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, SETUP_OK_HTML, HTTPD_RESP_USE_STRLEN);

    // Save + schedule reboot (1.5 s delay so response is fully sent)
    wifi_manager_save_and_restart(ssid, pass);
    return ESP_OK;
}

// ── Public API ────────────────────────────────────────────────────────────────
void web_server_start(void)
{
    httpd_config_t config   = HTTPD_DEFAULT_CONFIG();
    config.max_open_sockets  = 7;   // default; 13 exhausts lwIP pool when DNS also open
    config.lru_purge_enable  = true;
    config.max_uri_handlers  = 13;

    httpd_handle_t server = NULL;
    if (httpd_start(&server, &config) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start HTTP server");
        return;
    }

    static const httpd_uri_t uris[] = {
        { .uri = "/",                   .method = HTTP_GET,  .handler = handler_root       },
        { .uri = "/data",               .method = HTTP_GET,  .handler = handler_data       },
        { .uri = "/setup",              .method = HTTP_GET,  .handler = handler_setup_get  },
        { .uri = "/setup",              .method = HTTP_POST, .handler = handler_setup_post },
        { .uri = "/generate_204",       .method = HTTP_GET,  .handler = handler_captive    },
        { .uri = "/hotspot-detect.html",.method = HTTP_GET,  .handler = handler_captive    },
        { .uri = "/connecttest.txt",    .method = HTTP_GET,  .handler = handler_captive    },
        { .uri = "/ncsi.txt",           .method = HTTP_GET,  .handler = handler_captive    },
        { .uri = "/redirect",           .method = HTTP_GET,  .handler = handler_captive    },
        { .uri = "/success.txt",        .method = HTTP_GET,  .handler = handler_captive    },
        { .uri = "/canonical.html",     .method = HTTP_GET,  .handler = handler_captive    },
    };

    for (int i = 0; i < sizeof(uris) / sizeof(uris[0]); i++) {
        httpd_register_uri_handler(server, &uris[i]);
    }
    httpd_register_err_handler(server, HTTPD_404_NOT_FOUND, handler_404);

    ESP_LOGI(TAG, "HTTP server started — http://" AP_IP "/");
}
