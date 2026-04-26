#include "wifi_manager.h"
#include "app_config.h"

#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include <string.h>

static const char *TAG = "WIFI";

#define WIFI_CONNECTED_BIT  BIT0
#define WIFI_FAIL_BIT       BIT1

static EventGroupHandle_t s_wifi_eg;
static volatile bool      s_connected = false;
static bool               s_started   = false;
static char               s_ip[16]    = {0};

// ── Event handler ─────────────────────────────────────────────────────────────
// Does NOT call esp_wifi_connect() — task_wifi_manager owns all reconnection.

static void wifi_event_handler(void *arg, esp_event_base_t base,
                                int32_t id, void *data)
{
    if (base == WIFI_EVENT) {
        switch (id) {

        case WIFI_EVENT_STA_START:
            // First connect attempt only — triggered by esp_wifi_start()
            ESP_LOGI(TAG, "STA started — connecting to \"%s\"...", DEFAULT_WIFI_SSID);
            esp_wifi_connect();
            break;

        case WIFI_EVENT_STA_CONNECTED:
            ESP_LOGI(TAG, "Associated with AP — waiting for IP...");
            break;

        case WIFI_EVENT_STA_DISCONNECTED: {
            wifi_event_sta_disconnected_t *disc =
                (wifi_event_sta_disconnected_t *)data;
            s_connected = false;
            memset(s_ip, 0, sizeof(s_ip));
            ESP_LOGW(TAG, "Disconnected (reason %d) — wifi_manager will reconnect",
                     disc->reason);
            // Unblock any waiting wifi_connect() call
            xEventGroupSetBits(s_wifi_eg, WIFI_FAIL_BIT);
            break;
        }

        default:
            break;
        }

    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *evt = (ip_event_got_ip_t *)data;
        snprintf(s_ip, sizeof(s_ip), IPSTR, IP2STR(&evt->ip_info.ip));
        s_connected = true;
        xEventGroupSetBits(s_wifi_eg, WIFI_CONNECTED_BIT);
        ESP_LOGI(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        ESP_LOGI(TAG, "WiFi CONNECTED ✓");
        ESP_LOGI(TAG, "  SSID    : %s", DEFAULT_WIFI_SSID);
        ESP_LOGI(TAG, "  IP      : %s", s_ip);
        ESP_LOGI(TAG, "  Gateway : " IPSTR, IP2STR(&evt->ip_info.gw));
        ESP_LOGI(TAG, "  Netmask : " IPSTR, IP2STR(&evt->ip_info.netmask));
        ESP_LOGI(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

bool        wifi_is_connected(void) { return s_connected; }
const char *wifi_get_ip(void)       { return s_ip; }

esp_err_t wifi_init(void)
{
    s_wifi_eg = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL, NULL));

    ESP_LOGI(TAG, "WiFi stack allocated (STA only)");
    return ESP_OK;
}

// Connect or reconnect — call only from a FreeRTOS task.
// Blocks up to 15 s waiting for IP.
esp_err_t wifi_connect(void)
{
    xEventGroupClearBits(s_wifi_eg, WIFI_CONNECTED_BIT | WIFI_FAIL_BIT);

    wifi_config_t sta_cfg = {0};
    strlcpy((char *)sta_cfg.sta.ssid,     DEFAULT_WIFI_SSID, sizeof(sta_cfg.sta.ssid));
    strlcpy((char *)sta_cfg.sta.password, DEFAULT_WIFI_PASS,  sizeof(sta_cfg.sta.password));
    sta_cfg.sta.threshold.authmode = WIFI_AUTH_WPA_WPA2_PSK;

    if (s_started) {
        // Reconnect path — WiFi stack already running.
        // Disconnect first so esp_wifi_connect() is valid in DISCONNECTED state.
        esp_wifi_disconnect();
        vTaskDelay(pdMS_TO_TICKS(200));   // let DISCONNECTED event settle
        xEventGroupClearBits(s_wifi_eg, WIFI_CONNECTED_BIT | WIFI_FAIL_BIT);
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_cfg));
        esp_wifi_connect();
    } else {
        // First call — start RF from task context
        ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_cfg));
        ESP_ERROR_CHECK(esp_wifi_start());
        esp_wifi_set_ps(WIFI_PS_NONE);
        s_started = true;
        // WIFI_EVENT_STA_START fires and calls esp_wifi_connect()
    }

    EventBits_t bits = xEventGroupWaitBits(s_wifi_eg,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE,
                                           pdMS_TO_TICKS(15000));

    if (bits & WIFI_CONNECTED_BIT) return ESP_OK;
    if (bits & WIFI_FAIL_BIT)      return ESP_FAIL;

    ESP_LOGW(TAG, "Connection timeout after 15 s");
    return ESP_ERR_TIMEOUT;
}
