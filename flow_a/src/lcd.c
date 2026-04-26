#include "lcd.h"
#include "app_config.h"
#include "sensor_snapshot.h"

#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "esp_log.h"
#include <string.h>
#include <stdio.h>

extern SemaphoreHandle_t g_i2c_mutex;

static const char *TAG = "LCD";

// ── PCF8574 bit mapping ───────────────────────────────────────────
#define LCD_RS  0x01   // P0
#define LCD_RW  0x02   // P1 (unused — always 0)
#define LCD_EN  0x04   // P2
#define LCD_BL  0x08   // P3 backlight

// ── HD44780 commands ──────────────────────────────────────────────
#define CMD_CLEAR   0x01
#define CMD_ENTRY   0x06
#define CMD_DISP_ON 0x0C
#define CMD_4B2L    0x28   // 4-bit, 2-line (N=1), 5×8 — correct for 20x4

// ── 20x4 DDRAM row offsets ────────────────────────────────────────
static const uint8_t ROW_ADDR[4] = { 0x00, 0x40, 0x14, 0x54 };

static uint8_t s_addr  = 0x27;
static bool    s_found = false;

#define I2C_TIMEOUT_MS  50
#define LCD_COLS        20

// ── EN pulse — mutex held for both writes so pressure_task can't cut in ──
static void pulse_en(uint8_t data)
{
    if (!g_i2c_mutex) return;
    xSemaphoreTake(g_i2c_mutex, portMAX_DELAY);
    uint8_t hi = data | LCD_EN;
    uint8_t lo = data & ~LCD_EN;
    i2c_master_write_to_device(I2C_PORT, s_addr, &hi, 1, pdMS_TO_TICKS(I2C_TIMEOUT_MS));
    esp_rom_delay_us(5);    // EN high hold — well above 450 ns minimum
    i2c_master_write_to_device(I2C_PORT, s_addr, &lo, 1, pdMS_TO_TICKS(I2C_TIMEOUT_MS));
    xSemaphoreGive(g_i2c_mutex);
    esp_rom_delay_us(500);  // EN low hold before next nibble — generous margin
}

static void send_nibble(uint8_t nibble, uint8_t flags)
{
    pulse_en((nibble & 0xF0) | flags | LCD_BL);
}

static void lcd_write(uint8_t byte, uint8_t flags)
{
    send_nibble(byte & 0xF0,        flags);
    send_nibble((byte << 4) & 0xF0, flags);
    esp_rom_delay_us(500);  // command/data execution time — most cmds need 37 µs
}

static void lcd_cmd(uint8_t cmd) { lcd_write(cmd, 0);      }
static void lcd_dat(uint8_t ch)  { lcd_write(ch,  LCD_RS); }

static void lcd_set_cursor(uint8_t row, uint8_t col)
{
    lcd_cmd(0x80 | (ROW_ADDR[row & 3] + col));
}

static void lcd_print(const char *str)
{
    while (*str) lcd_dat((uint8_t)*str++);
}

// ── Full HD44780 reset per datasheet ─────────────────────────────
static void lcd_reset(void)
{
    vTaskDelay(pdMS_TO_TICKS(100));

    send_nibble(0x30, 0); vTaskDelay(pdMS_TO_TICKS(5));
    send_nibble(0x30, 0); esp_rom_delay_us(200);
    send_nibble(0x30, 0); esp_rom_delay_us(200);
    send_nibble(0x20, 0); esp_rom_delay_us(200);

    lcd_cmd(CMD_4B2L);
    lcd_cmd(0x08);              // display OFF
    lcd_cmd(CMD_CLEAR);
    vTaskDelay(pdMS_TO_TICKS(2));
    lcd_cmd(CMD_ENTRY);
    lcd_cmd(CMD_DISP_ON);       // display ON — always last
}

// ── I2C scan — logs all devices present ──────────────────────────
static void i2c_scan(void)
{
    ESP_LOGI(TAG, "I2C scan (SDA=GPIO%d SCL=GPIO%d @ %d Hz):",
             I2C_SDA_GPIO, I2C_SCL_GPIO, I2C_FREQ_HZ);
    uint8_t dummy = 0x00;
    bool found_any = false;
    for (uint8_t addr = 0x08; addr < 0x78; addr++) {
        xSemaphoreTake(g_i2c_mutex, portMAX_DELAY);
        esp_err_t err = i2c_master_write_to_device(I2C_PORT, addr, &dummy, 1,
                                                   pdMS_TO_TICKS(20));
        xSemaphoreGive(g_i2c_mutex);
        if (err == ESP_OK) {
            ESP_LOGI(TAG, "  Found device at 0x%02X", addr);
            found_any = true;
        }
    }
    if (!found_any)
        ESP_LOGW(TAG, "  No devices found — check SDA/SCL and pull-ups!");
}

// ── Display task — updates all 4 rows every 1 s ──────────────────
//
//  Row 0:  "IN:  x.xxx m3/h     "  — inlet  flow rate
//  Row 1:  "OUT: x.xxx m3/h     "  — outlet flow rate
//  Row 2:  "Vi:xxx.xL  Vo:xxx.xL"  — cumulative volume IN / OUT
//  Row 3:  "PRES:   xx.xx PSI   "  — line pressure
//
static void lcd_task(void *arg)
{
    g_lcd_task_handle = xTaskGetCurrentTaskHandle();
    char line[LCD_COLS + 1];

    while (1) {
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(UPDATE_INTERVAL_MS + 2000));

        float fin_m3h  = g_snap.flow_in_m3h;
        float fout_m3h = g_snap.flow_out_m3h;
        float vin_m3   = g_snap.volume_in_m3;
        float vout_m3  = g_snap.volume_out_m3;
        float psi      = g_snap.pressure_psi;

        // Row 0: inlet flow rate  "IN:  0.0000 m3/h    "
        snprintf(line, sizeof(line), "IN: %8.4f m3/h  ", fin_m3h);
        lcd_set_cursor(0, 0); esp_rom_delay_us(500);
        lcd_print(line);

        // Row 1: outlet flow rate
        snprintf(line, sizeof(line), "OUT:%8.4f m3/h  ", fout_m3h);
        lcd_set_cursor(1, 0); esp_rom_delay_us(500);
        lcd_print(line);

        // Row 2: cumulative volumes in m³  "Vi:0.0000 Vo:0.0000"  (20 chars)
        snprintf(line, sizeof(line), "Vi:%.4f Vo:%.4f ", vin_m3, vout_m3);
        lcd_set_cursor(2, 0); esp_rom_delay_us(500);
        lcd_print(line);

        // Row 3: line pressure
        snprintf(line, sizeof(line), "PRES:   %5.2f PSI   ", psi);
        lcd_set_cursor(3, 0); esp_rom_delay_us(500);
        lcd_print(line);
    }
}

// ── Public API ────────────────────────────────────────────────────
void lcd_init(void)
{
    if (!g_i2c_mutex) {
        ESP_LOGE(TAG, "Cannot init LCD: I2C mutex not ready");
        return;
    }

    i2c_scan();

    // Auto-detect: PCF8574 (0x27) or PCF8574A (0x3F)
    static const uint8_t candidates[] = { 0x27, 0x3F };
    uint8_t dummy = 0x00;
    for (int i = 0; i < 2; i++) {
        xSemaphoreTake(g_i2c_mutex, portMAX_DELAY);
        esp_err_t err = i2c_master_write_to_device(I2C_PORT, candidates[i],
                                                   &dummy, 1,
                                                   pdMS_TO_TICKS(50));
        xSemaphoreGive(g_i2c_mutex);
        if (err == ESP_OK) {
            s_addr  = candidates[i];
            s_found = true;
            ESP_LOGI(TAG, "LCD (20x4) found at 0x%02X", s_addr);
            break;
        }
    }
    if (!s_found) {
        ESP_LOGW(TAG, "No LCD found at 0x27 or 0x3F");
        return;
    }

    lcd_reset();

    // Splash screen
    lcd_set_cursor(0, 0); lcd_print("    Flowsense  v1   ");
    lcd_set_cursor(1, 0); lcd_print("  Water  Monitoring ");
    lcd_set_cursor(2, 0); lcd_print("                    ");
    lcd_set_cursor(3, 0); lcd_print("   Initializing...  ");

    vTaskDelay(pdMS_TO_TICKS(2500));

    lcd_cmd(CMD_CLEAR);
    vTaskDelay(pdMS_TO_TICKS(3));

    // Pin to Core 1 — WiFi runs on Core 0 and preempts I2C mid-write
    xTaskCreatePinnedToCore(lcd_task, "lcd_task", 3072, NULL, 4, NULL, 1);
    ESP_LOGI(TAG, "LCD task started (Core 1)");
}
