#include "wifi_manager.h"
#include "app_config.h"
#include "dns_server.h"
#include "web_server.h"

#include "nvs.h"
#include "nvs_flash.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include <string.h>

static const char *TAG = "WIFI";

// ── NVS keys ──────────────────────────────────────────────────────────────────
#define NVS_NAMESPACE   "flowsense"
#define NVS_KEY_SSID    "wifi_ssid"
#define NVS_KEY_PASS    "wifi_pass"

// ── Event group bits ──────────────────────────────────────────────────────────
#define WIFI_CONNECTED_BIT  BIT0
#define WIFI_FAIL_BIT       BIT1

#define MAX_RETRIES  5

// ── State ─────────────────────────────────────────────────────────────────────
static EventGroupHandle_t s_wifi_eg;
static volatile bool      s_connected   = false;
static int                s_retry_count = 0;
static bool               s_started     = false;   // true once esp_wifi_start() has been called
static char               s_ip[16]      = {0};

// ── NVS helpers ───────────────────────────────────────────────────────────────

static bool nvs_read_str(const char *key, char *out, size_t len)
{
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &h) != ESP_OK) return false;
    size_t l = len;
    bool ok = (nvs_get_str(h, key, out, &l) == ESP_OK);
    nvs_close(h);
    return ok;
}

static esp_err_t nvs_write_str(const char *key, const char *val)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    err = nvs_set_str(h, key, val);
    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);
    return err;
}

// ── Reboot task (deferred so HTTP response is sent first) ─────────────────────

static void reboot_task(void *arg)
{
    vTaskDelay(pdMS_TO_TICKS(1500));
    esp_restart();
}

// ── Event handler ─────────────────────────────────────────────────────────────

static void wifi_event_handler(void *arg, esp_event_base_t base,
                                int32_t id, void *data)
{
    if (base == WIFI_EVENT) {
        switch (id) {

        case WIFI_EVENT_STA_START:
            // STA stack is up — issue the first connect attempt
            esp_wifi_connect();
            break;

        case WIFI_EVENT_STA_CONNECTED:
            ESP_LOGI(TAG, "STA connected — waiting for IP...");
            s_retry_count = 0;
            break;

        case WIFI_EVENT_STA_DISCONNECTED:
            s_connected = false;
            if (s_retry_count < MAX_RETRIES) {
                s_retry_count++;
                ESP_LOGW(TAG, "Disconnected — retry %d/%d", s_retry_count, MAX_RETRIES);
                esp_wifi_connect();
            } else {
                xEventGroupSetBits(s_wifi_eg, WIFI_FAIL_BIT);
                ESP_LOGE(TAG, "Max retries reached");
            }
            break;

        case WIFI_EVENT_AP_START:
            // AP is up — start captive portal services
            dns_server_start();
            web_server_start();
            ESP_LOGI(TAG, "Provisioning AP started — SSID:\"%s\"  portal: http://" AP_IP "/",
                     AP_SSID);
            break;

        case WIFI_EVENT_AP_STACONNECTED:
            ESP_LOGI(TAG, "Client connected to hotspot");
            break;

        case WIFI_EVENT_AP_STADISCONNECTED:
            ESP_LOGI(TAG, "Client disconnected from hotspot");
            break;

        default:
            break;
        }

    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *evt = (ip_event_got_ip_t *)data;
        snprintf(s_ip, sizeof(s_ip), IPSTR, IP2STR(&evt->ip_info.ip));
        s_connected   = true;
        s_retry_count = 0;
        xEventGroupSetBits(s_wifi_eg, WIFI_CONNECTED_BIT);
        ESP_LOGI(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        ESP_LOGI(TAG, "WiFi CONNECTED ✓");
        ESP_LOGI(TAG, "  IP      : %s", s_ip);
        ESP_LOGI(TAG, "  Gateway : " IPSTR, IP2STR(&evt->ip_info.gw));
        ESP_LOGI(TAG, "  Netmask : " IPSTR, IP2STR(&evt->ip_info.netmask));
        ESP_LOGI(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

bool        wifi_is_connected(void) { return s_connected; }
const char *wifi_get_ip(void)       { return s_ip; }

esp_err_t wifi_manager_save_and_restart(const char *ssid, const char *pass)
{
    esp_err_t err = nvs_write_str(NVS_KEY_SSID, ssid);
    if (err != ESP_OK) return err;
    err = nvs_write_str(NVS_KEY_PASS, pass);
    if (err != ESP_OK) return err;
    ESP_LOGI(TAG, "Credentials saved (SSID: %s) — rebooting...", ssid);
    xTaskCreate(reboot_task, "reboot", 1024, NULL, 5, NULL);
    return ESP_OK;
}

// ── wifi_init — allocates WiFi stack, does NOT start RF ───────────────────────
// Mirrors BlueWatt's wifi_init() exactly.
// phy_init has NOT run after this returns — it fires inside wifi_connect().

esp_err_t wifi_init(void)
{
    s_wifi_eg = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    // Pre-create both netifs — STA used by wifi_connect(), AP used by wifi_start_provisioning_mode()
    esp_netif_create_default_wifi_sta();
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                                        wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                                        wifi_event_handler, NULL, NULL));

    ESP_LOGI(TAG, "WiFi stack allocated — RF not yet started (phy_init pending)");
    return ESP_OK;
}

// ── wifi_connect — starts RF in STA-only mode ─────────────────────────────────
// Call from a FreeRTOS task (never from app_main).
// On first call: esp_wifi_start() fires phy_init.
// On subsequent calls (reconnect): reuses the running stack.

esp_err_t wifi_connect(void)
{
    char ssid[64] = {0};
    char pass[64] = {0};

    if (nvs_read_str(NVS_KEY_SSID, ssid, sizeof(ssid)) && ssid[0] != '\0') {
        nvs_read_str(NVS_KEY_PASS, pass, sizeof(pass));
        ESP_LOGI(TAG, "Using saved credentials — SSID: \"%s\"", ssid);
    } else {
        strlcpy(ssid, DEFAULT_WIFI_SSID, sizeof(ssid));
        strlcpy(pass, DEFAULT_WIFI_PASS,  sizeof(pass));
        ESP_LOGI(TAG, "No saved credentials — using default SSID: \"%s\"", ssid);
    }

    // Clear stale bits before waiting
    xEventGroupClearBits(s_wifi_eg, WIFI_CONNECTED_BIT | WIFI_FAIL_BIT);
    s_retry_count = 0;

    wifi_config_t sta_cfg = {0};
    strlcpy((char *)sta_cfg.sta.ssid,     ssid, sizeof(sta_cfg.sta.ssid));
    strlcpy((char *)sta_cfg.sta.password, pass, sizeof(sta_cfg.sta.password));

    if (s_started) {
        // Stack already running — update config and reconnect
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_cfg));
        esp_wifi_connect();
    } else {
        // First call — this is where phy_init fires
        ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_cfg));
        ESP_ERROR_CHECK(esp_wifi_start());   // ← phy_init happens here, from task context
        esp_wifi_set_ps(WIFI_PS_NONE);       // disable modem sleep for stable link
        s_started = true;
        // WIFI_EVENT_STA_START fires and calls esp_wifi_connect() automatically
    }

    // Wait up to 15 s for connection or failure
    EventBits_t bits = xEventGroupWaitBits(s_wifi_eg,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE,
                                           pdMS_TO_TICKS(15000));

    if (bits & WIFI_CONNECTED_BIT) return ESP_OK;
    if (bits & WIFI_FAIL_BIT)      return ESP_FAIL;

    ESP_LOGW(TAG, "Connection timeout after 15 s");
    return ESP_ERR_TIMEOUT;
}

// ── wifi_start_provisioning_mode — AP-only fallback ───────────────────────────
// Stops STA (if running), starts AP-only mode.
// WIFI_EVENT_AP_START fires and starts dns_server + web_server automatically.

void wifi_start_provisioning_mode(void)
{
    ESP_LOGI(TAG, "Starting provisioning AP: \"%s\"", AP_SSID);

    wifi_config_t ap_cfg = {
        .ap = {
            .ssid_len       = sizeof(AP_SSID) - 1,
            .channel        = AP_CHANNEL,
            .max_connection = AP_MAX_CONN,
            .authmode       = WIFI_AUTH_WPA2_PSK,
        },
    };
    memcpy(ap_cfg.ap.ssid,     AP_SSID,     sizeof(AP_SSID));
    memcpy(ap_cfg.ap.password, AP_PASSWORD, sizeof(AP_PASSWORD));

    if (s_started) {
        esp_wifi_stop();
        s_started = false;
    }

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());
    s_started = true;
}
