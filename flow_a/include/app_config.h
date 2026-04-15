#pragma once

// ── Hotspot (SoftAP) ──────────────────────────────────────────────────────────
#define AP_SSID             "Flowsense"     // hotspot network name
#define AP_PASSWORD         "flowsense"     // min 8 chars for WPA2; "" = open
#define AP_CHANNEL          6               // ch 6 — least overlap with 1 & 11
#define AP_MAX_CONN         4               // max simultaneous clients
#define AP_IP               "192.168.4.1"  // ESP32 gateway IP (DHCP default)

// ── GPIO Pin Assignments ──────────────────────────────────────────────────────
#define FLOW_IN_GPIO        25      // YF-S201 inlet  — yellow via 1k/2k divider
#define FLOW_OUT_GPIO       26      // YF-S201 outlet — yellow via 1k/2k divider

// ── I2C Bus (ADS1115 + both LCDs, shared on GPIO 21/22) ──────────────────────
#define I2C_PORT            I2C_NUM_0
#define I2C_SDA_GPIO        21
#define I2C_SCL_GPIO        22
#define I2C_FREQ_HZ         25000   // 25 kHz — conservative for PCF8574 over long wires

// LCD — PCF8574 default (0x27) or PCF8574A default (0x3F), auto-detected
#define LCD_ADDR            0x27

// ── ADS1115 (pressure ADC) ────────────────────────────────────────────────────
#define ADS1115_ADDR        0x48    // ADDR pin tied to GND
// PGA = ±4.096 V → LSB = 0.125 mV
#define ADS1115_LSB_MV      0.125f

// ── SIG_SCALE voltage divider (R1=4.7 kΩ, R2=10 kΩ) ─────────────────────────
// Scales transducer 0.5–4.5 V down to 0.34–3.06 V (safe for ADS1115 at 3.3 V)
#define SIG_SCALE_R1        4700.0f
#define SIG_SCALE_R2        10000.0f
#define SIG_SCALE_RATIO     (SIG_SCALE_R2 / (SIG_SCALE_R1 + SIG_SCALE_R2))  // 0.680

// ── Pressure Sensor Calibration (0–30 PSI ratiometric, 0.5–4.5 V output) ─────
#define PRESS_V_MIN         0.5f    // transducer voltage at 0 PSI  (V)
#define PRESS_V_MAX         4.5f    // transducer voltage at 30 PSI (V)
#define PRESS_PSI_MAX       30.0f

// ── Flow Sensor Calibration (YF-S201) ─────────────────────────────────────────
#define YF_S201_FACTOR      7.5f    // flow rate (L/min) = freq_Hz / 7.5

// ── Unit Conversion (SI — cubic metres per minute) ───────────────────────────
#define LPM_TO_M3MIN        0.001f      // L/min  → m³/min (×0.001)
#define L_TO_M3             0.001f      // litres → m³     (×0.001)

// ── Default WiFi credentials (used when NVS has no saved credentials) ────────
#define DEFAULT_WIFI_SSID       "Team Flores"
#define DEFAULT_WIFI_PASS       "Lelachaiah1702"

// ── Render cloud server ───────────────────────────────────────────────────────
#define RENDER_SERVER_URL       "https://flowsense-server.onrender.com"

// ── Task Periods ──────────────────────────────────────────────────────────────
#define FLOW_TASK_PERIOD_MS     250
#define PRESSURE_TASK_PERIOD_MS 500
