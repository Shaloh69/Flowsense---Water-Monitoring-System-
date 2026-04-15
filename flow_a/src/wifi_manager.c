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

#define NVS_NAMESPACE   "flowsense"
#define NVS_KEY_SSID    "wifi_ssid"
#define NVS_KEY_PASS    "wifi_pass"

#define MAX_STA_RETRIES  10
#define STA_CONNECTED_BIT BIT0

static EventGroupHandle_t s_wifi_eg;
static volatile bool      s_sta_connected = false;
static int                s_retry_count   = 0;
static bool               s_provisioning  = false;
static bool               s_ap_services_started = false;

// ── NVS helpers ───────────────────────────────────────────────────────────────

static bool nvs_read_str(const char *key, char *out, size_t out_len)
{
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &h) != ESP_OK) return false;
    size_t len = out_len;
    bool ok = (nvs_get_str(h, key, out, &len) == ESP_OK);
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

static bool has_credentials(void)
{
    char ssid[64] = {0};
    return nvs_read_str(NVS_KEY_SSID, ssid, sizeof(ssid)) && ssid[0] != '\0';
}

// ── Reboot task (deferred so HTTP response can be sent first) ─────────────────

static void reboot_task(void *arg)
{
    vTaskDelay(pdMS_TO_TICKS(1500));
    esp_restart();
}

// ── AP config helper ──────────────────────────────────────────────────────────

static void configure_ap(void)
{
    wifi_config_t ap_cfg = {
        .ap = {
            .ssid_len        = sizeof(AP_SSID) - 1,
            .channel         = AP_CHANNEL,
            .max_connection  = AP_MAX_CONN,
            .authmode        = WIFI_AUTH_WPA2_PSK,
            .beacon_interval = 100,
            .pmf_cfg         = { .capable = false, .required = false },
        },
    };
    memcpy(ap_cfg.ap.ssid,     AP_SSID,     sizeof(AP_SSID));
    memcpy(ap_cfg.ap.password, AP_PASSWORD, sizeof(AP_PASSWORD));
    esp_wifi_set_config(WIFI_IF_AP, &ap_cfg);
}

// ── Event handler ─────────────────────────────────────────────────────────────

static void wifi_event_handler(void *arg, esp_event_base_t base,
                                int32_t id, void *data)
{
    if (base == WIFI_EVENT) {
        switch (id) {

        case WIFI_EVENT_AP_START: {
            if (s_ap_services_started) break;  // guard against duplicate AP_START
            s_ap_services_started = true;

            // Set DHCP Option 114 (captive portal URI)
            esp_netif_t *ap_netif = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
            if (ap_netif) {
                const char *uri = "http://" AP_IP "/";
                esp_netif_dhcps_stop(ap_netif);
                esp_netif_dhcps_option(ap_netif, ESP_NETIF_OP_SET,
                                       ESP_NETIF_CAPTIVEPORTAL_URI,
                                       (void *)uri, strlen(uri));
                esp_netif_dhcps_start(ap_netif);
            }
            dns_server_start();
            web_server_start();
            ESP_LOGI(TAG, "AP started — SSID:\"%s\"  PW:\"%s\"  IP:" AP_IP
                     "  mode:%s", AP_SSID, AP_PASSWORD,
                     s_provisioning ? "PROVISIONING" : "NORMAL");
            break;
        }

        case WIFI_EVENT_AP_STACONNECTED:
            ESP_LOGI(TAG, "Client connected to hotspot");
            break;

        case WIFI_EVENT_AP_STADISCONNECTED:
            ESP_LOGI(TAG, "Client disconnected from hotspot");
            break;

        case WIFI_EVENT_STA_START:
            esp_wifi_connect();
            break;

        case WIFI_EVENT_STA_CONNECTED:
            ESP_LOGI(TAG, "STA connected to router — waiting for IP...");
            s_retry_count = 0;
            break;

        case WIFI_EVENT_STA_DISCONNECTED: {
            s_sta_connected = false;
            if (s_retry_count < MAX_STA_RETRIES) {
                s_retry_count++;
                ESP_LOGW(TAG, "STA disconnected, retry %d/%d",
                         s_retry_count, MAX_STA_RETRIES);
                vTaskDelay(pdMS_TO_TICKS(2000));
                esp_wifi_connect();
            } else {
                ESP_LOGE(TAG, "STA: max retries reached — check credentials");
            }
            break;
        }

        default: break;
        }

    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *evt = (ip_event_got_ip_t *)data;
        ESP_LOGI(TAG, "STA got IP: " IPSTR " — internet available",
                 IP2STR(&evt->ip_info.ip));
        s_sta_connected = true;
        s_retry_count   = 0;
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

bool wifi_manager_is_sta_connected(void) { return s_sta_connected; }

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

esp_err_t wifi_manager_init(void)
{
    s_wifi_eg = xEventGroupCreate();

    esp_netif_init();
    esp_event_loop_create_default();

    // Create AP netif always
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);

    esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                        wifi_event_handler, NULL, NULL);
    esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                        wifi_event_handler, NULL, NULL);

    if (has_credentials()) {
        // ── APSTA mode: keep hotspot + connect to router ──────────────────
        char ssid[64] = {0};
        char pass[64] = {0};
        nvs_read_str(NVS_KEY_SSID, ssid, sizeof(ssid));
        nvs_read_str(NVS_KEY_PASS, pass, sizeof(pass));

        esp_netif_create_default_wifi_sta();
        esp_wifi_set_mode(WIFI_MODE_APSTA);

        configure_ap();

        wifi_config_t sta_cfg = {0};
        strlcpy((char *)sta_cfg.sta.ssid,     ssid, sizeof(sta_cfg.sta.ssid));
        strlcpy((char *)sta_cfg.sta.password, pass, sizeof(sta_cfg.sta.password));
        esp_wifi_set_config(WIFI_IF_STA, &sta_cfg);

        s_provisioning = false;
        ESP_LOGI(TAG, "APSTA mode — STA target: \"%s\"", ssid);

    } else {
        // ── AP-only provisioning mode ─────────────────────────────────────
        esp_wifi_set_mode(WIFI_MODE_AP);
        configure_ap();
        s_provisioning = true;
        ESP_LOGI(TAG, "AP-only provisioning mode — go to http://" AP_IP "/setup");
    }

    // Use RAM storage — prevents WiFi driver from accessing flash during operation
    // which competes with I2C on the same APB bus and corrupts LCD writes
    esp_wifi_set_storage(WIFI_STORAGE_RAM);

    esp_wifi_start();
    esp_wifi_set_max_tx_power(40);   // 10 dBm — reduces peak current draw on startup
    esp_wifi_set_ps(WIFI_PS_NONE);
    esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);

    return ESP_OK;
}
