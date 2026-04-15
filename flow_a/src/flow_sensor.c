#include "flow_sensor.h"
#include "app_config.h"

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

#include <string.h>

static const char *TAG = "FLOW";

// ── Raw pulse counters updated from ISR ──────────────────────────────────────
static volatile uint32_t s_pulse_count[2] = {0, 0};

// ── Computed values updated by flow_task ─────────────────────────────────────
static volatile float s_rate_lpm[2]       = {0.0f, 0.0f};
static volatile float s_volume_liters[2]  = {0.0f, 0.0f};

// ── ISR handlers ─────────────────────────────────────────────────────────────
static void IRAM_ATTR isr_flow_in(void *arg)
{
    s_pulse_count[FLOW_CH_IN]++;
}

static void IRAM_ATTR isr_flow_out(void *arg)
{
    s_pulse_count[FLOW_CH_OUT]++;
}

// ── FreeRTOS task ─────────────────────────────────────────────────────────────
static void flow_task(void *arg)
{
    const float period_s = FLOW_TASK_PERIOD_MS / 1000.0f;
    uint32_t last_count[2] = {0, 0};

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(FLOW_TASK_PERIOD_MS));

        for (int ch = 0; ch < 2; ch++) {
            // Snapshot and clear delta using a critical section
            portDISABLE_INTERRUPTS();
            uint32_t current = s_pulse_count[ch];
            portENABLE_INTERRUPTS();

            uint32_t delta = current - last_count[ch];
            last_count[ch] = current;

            // Flow rate: pulses per second / YF_S201_FACTOR = L/min
            float freq_hz   = delta / period_s;
            float rate      = freq_hz / YF_S201_FACTOR;
            s_rate_lpm[ch]  = rate;

            // Volume: rate (L/min) × period (min)
            s_volume_liters[ch] += rate * (period_s / 60.0f);
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────
void flow_sensor_init(void)
{
    // Configure FLOW_IN
    gpio_config_t cfg = {
        .pin_bit_mask = (1ULL << FLOW_IN_GPIO),
        .mode         = GPIO_MODE_INPUT,
        .pull_up_en   = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_POSEDGE,
    };
    gpio_config(&cfg);

    // Configure FLOW_OUT
    cfg.pin_bit_mask = (1ULL << FLOW_OUT_GPIO);
    gpio_config(&cfg);

    // Install ISR service (if not already installed by main)
    gpio_install_isr_service(0);

    gpio_isr_handler_add(FLOW_IN_GPIO,  isr_flow_in,  NULL);
    gpio_isr_handler_add(FLOW_OUT_GPIO, isr_flow_out, NULL);

    xTaskCreate(flow_task, "flow_task", 2048, NULL, 5, NULL);

    ESP_LOGI(TAG, "Flow sensors initialized (IN=GPIO%d, OUT=GPIO%d)",
             FLOW_IN_GPIO, FLOW_OUT_GPIO);
}

float flow_sensor_get_rate_lpm(int channel)
{
    return (channel == FLOW_CH_IN || channel == FLOW_CH_OUT)
           ? s_rate_lpm[channel] : 0.0f;
}

float flow_sensor_get_volume_liters(int channel)
{
    return (channel == FLOW_CH_IN || channel == FLOW_CH_OUT)
           ? s_volume_liters[channel] : 0.0f;
}

void flow_sensor_reset_volume(int channel)
{
    if (channel == FLOW_CH_IN || channel == FLOW_CH_OUT) {
        s_volume_liters[channel] = 0.0f;
    }
}
