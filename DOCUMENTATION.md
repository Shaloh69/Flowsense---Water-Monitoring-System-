# Flowsense — Water Monitoring System Documentation

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Hardware Components](#2-hardware-components)
3. [Wiring & Pin Assignments](#3-wiring--pin-assignments)
4. [ESP32 Firmware](#4-esp32-firmware)
5. [Server (Backend)](#5-server-backend)
6. [Client (Frontend)](#6-client-frontend)
7. [Database Schema](#7-database-schema)
8. [Billing Structure](#8-billing-structure)
9. [Configuration Reference](#9-configuration-reference)
10. [Deployment](#10-deployment)
11. [Seeder & Demo Mode](#11-seeder--demo-mode)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. System Overview

Flowsense is a real-time water consumption monitoring system designed for residential use. It measures water flow (inlet and outlet), line pressure, and accumulated volume — then streams live data to a cloud dashboard and LCD display.

```
[Water Main] → [Inlet YF-S201] → [House Plumbing] → [Outlet YF-S201] → [Drain/Use]
                                        ↕
                               [Pressure Transducer]
                                        ↕
                                   [ESP32 DevKit]
                                   /           \
                             [LCD 20×4]    [WiFi → Cloud]
                                               ↕
                                    [Render Server + MySQL]
                                               ↕
                                    [Next.js Web Dashboard]
```

**Data flow:**
1. ESP32 reads sensors every 250 ms (flow) and 500 ms (pressure)
2. Every 10 seconds, a snapshot is pushed to the LCD and POSTed to the Render server
3. The server persists readings, accumulates daily summaries, and streams live data via SSE
4. The Next.js dashboard displays live readings, charts, reports, and generates bills

---

## 2. Hardware Components

| Component | Model | Purpose |
|-----------|-------|---------|
| Microcontroller | ESP32 DevKit v1 | Central controller, WiFi, GPIO |
| Flow Sensor (×2) | YF-S201 Hall-effect | Pulse counting for inlet & outlet |
| Pressure Sensor | 0–30 PSI ratiometric transducer | Line pressure measurement |
| ADC | ADS1115 16-bit I2C | Converts pressure sensor 0–4.5 V to digital |
| LCD Display | 20×4 HD44780 via PCF8574 I2C backpack | Local readout |
| Voltage Divider | R1 = 4.7 kΩ, R2 = 10 kΩ | Scales 0–4.5 V to 0–3.06 V for ADS1115 |
| Stabilization Cap | 470 µF electrolytic | Absorbs WiFi phy_init current spike |
| Power Supply | HLK-PM01 + AMS1117-3.3 | AC→DC 5 V, then 3.3 V regulated |
| Power Supply (alt) | 5 V / 3 A USB charger | Standalone operation |

### YF-S201 Flow Sensor

- Output: open-collector pulse train (rising edge per partial rotation)
- Calibration factor: **7.5 pulses per litre** (factory default)
- Signal level: 5 V logic — connected via 1 kΩ/2 kΩ voltage divider to bring to 3.3 V safe for ESP32

### Pressure Transducer

- Range: 0–30 PSI
- Output: ratiometric 0.5–4.5 V (0 PSI = 0.5 V, 30 PSI = 4.5 V)
- Connected through voltage divider (ratio ≈ 0.680) then to ADS1115 AIN0

### ADS1115

- Address: `0x48` (ADDR pin tied to GND)
- PGA: ±4.096 V → LSB = 0.125 mV
- Single-shot mode, one conversion per pressure task cycle (~500 ms)

### LCD (20×4 HD44780)

- Interface: PCF8574 I2C backpack
- Address: auto-detected (`0x27` PCF8574 or `0x3F` PCF8574A)
- Shared I2C bus with ADS1115 (GPIO 21/22, 25 kHz)

---

## 3. Wiring & Pin Assignments

### ESP32 GPIO Map

| GPIO | Signal | Connected To |
|------|--------|-------------|
| 25 | `FLOW_IN_GPIO` | YF-S201 inlet (yellow wire via 1k/2k divider) |
| 26 | `FLOW_OUT_GPIO` | YF-S201 outlet (yellow wire via 1k/2k divider) |
| 21 | `I2C_SDA` | ADS1115 SDA + LCD PCF8574 SDA |
| 22 | `I2C_SCL` | ADS1115 SCL + LCD PCF8574 SCL |
| 3.3V | Power | ADS1115 VDD, PCF8574 VDD |
| GND | Ground | All sensors, divider bottom rail |
| VIN/5V | Power input | YF-S201 VCC (5 V), HLK-PM01 output |

### Voltage Divider (Pressure Signal)

```
Transducer OUT ──┬── R1 (4.7 kΩ) ──┬── ADS1115 AIN0
                 │                   │
                GND            R2 (10 kΩ)
                                     │
                                    GND

Scale ratio = R2 / (R1 + R2) = 10k / 14.7k ≈ 0.680
Max input: 4.5 V × 0.680 = 3.06 V  (safe for 3.3 V ADS1115)
```

### YF-S201 Signal Conditioning

```
YF-S201 signal (5 V) ── 1 kΩ ──┬── ESP32 GPIO (3.3 V)
                                 │
                              2 kΩ
                                 │
                                GND
```

### Stabilization Capacitor

- 470 µF between ESP32 3V3 pin and GND
- Placed physically close to the ESP32 module
- Prevents brownout during WiFi phy_init current spike (~400 mA peak)

---

## 4. ESP32 Firmware

**Framework:** ESP-IDF 5.x (via PlatformIO)  
**Language:** C  
**Location:** `flow_a/`

### File Structure

```
flow_a/
├── include/
│   ├── app_config.h        — all constants, pins, calibration, WiFi credentials
│   ├── flow_sensor.h       — YF-S201 pulse counting API
│   ├── pressure_sensor.h   — ADS1115 / PSI conversion API
│   ├── sensor_snapshot.h   — shared snapshot struct + task handles
│   ├── lcd.h               — 20×4 LCD display API
│   ├── http_poster.h       — HTTPS POST to Render server
│   └── wifi_manager.h      — WiFi STA connection API
└── src/
    ├── main.c              — app_main, task creation
    ├── flow_sensor.c       — GPIO ISR pulse counting, L/min, cumulative volume
    ├── pressure_sensor.c   — ADS1115 I2C driver, EMA filter, PSI conversion
    ├── sensor_snapshot.c   — global snapshot definition
    ├── lcd.c               — HD44780 driver via PCF8574, display task
    ├── http_poster.c       — HTTPS POST task with retry logic
    ├── wifi_manager.c      — WiFi STA init, connect, reconnect
    ├── dns_server.c        — stub (provisioning removed)
    └── web_server.c        — stub (provisioning removed)
```

### Startup Sequence (`main.c`)

```
app_main()
  1. nvs_flash_init()               — NVS for PHY calibration storage
  2. flow_sensor_init()             — Install GPIO ISRs for both sensors
  3. pressure_sensor_init()         — I2C bus recovery, driver install, mutex create
  4. lcd_init()                     — I2C scan, HD44780 reset, splash screen
  5. wifi_init()                    — Allocate WiFi stack (no RF yet)
  6. xTaskCreate(task_sensor_refresh) — Reads sensors → g_snap → notifies LCD & poster
  7. xTaskCreate(task_wifi_manager)   — Connects WiFi, starts poster, reconnects
```

### FreeRTOS Tasks

| Task | Core | Priority | Stack | Period | Role |
|------|------|----------|-------|--------|------|
| `flow_task` | 1 | 5 | 2 KB | 250 ms | Compute L/min and accumulate volume |
| `pressure_task` | 1 | 5 | 2 KB | 500 ms | Read ADS1115, apply EMA filter |
| `snap_refresh` | any | 4 | 2 KB | 10 000 ms | Snapshot all sensors → notify LCD & poster |
| `lcd_task` | 1 | 4 | 3 KB | on notify | Update 20×4 LCD display |
| `http_poster` | any | 3 | 8 KB | on notify | POST JSON to Render server |
| `wifi_mgr` | any | 3 | 4 KB | 5 000 ms | Maintain WiFi connection |

### Flow Sensor Module (`flow_sensor.c`)

**Mechanism:** GPIO interrupt on rising edge increments an atomic pulse counter.

**Rate calculation (every 250 ms):**
```
delta_pulses = current_count − last_count
freq_hz      = delta_pulses / 0.250
flow_lpm     = freq_hz / YF_S201_FACTOR   (7.5 pulses/L/min)
volume_L    += (flow_lpm / 60.0) × 0.250
```

**Unit conversions (in `snap_refresh`):**
```
flow_m3h   = flow_lpm  × 0.06       (L/min → m³/h)
volume_m3  = volume_L  × 0.001      (L → m³)
```

### Pressure Sensor Module (`pressure_sensor.c`)

**ADS1115 config word:** `0xC383` — MUX=AIN0/GND, PGA=±4.096 V, single-shot, 128 SPS

**Conversion chain:**
```
raw_counts  →  V_adc = raw × 0.125 mV
V_adc       →  V_sensor = V_adc / 0.680   (undo voltage divider)
V_sensor    →  PSI = (V_sensor − 0.5) / 4.0 × 30.0   (transducer transfer function)
PSI         →  PSI − 5.0   (noise offset calibration)
PSI         →  clamp [0, 30]
PSI         →  EMA filter (α = 0.25)
PSI         →  deadband: if < 3.5 PSI → 0.0
```

**EMA filter:**  
`filtered = 0.25 × new + 0.75 × previous`  
Cold-start: first non-zero sample seeds the filter directly (no ramp-up lag).

### Sensor Snapshot (`sensor_snapshot.h`)

All tasks share one atomic snapshot struct. `snap_refresh` writes it; `lcd_task` and `http_poster` read it — ensuring LCD and website always show identical values.

```c
typedef struct {
    float flow_in_m3h;
    float flow_out_m3h;
    float volume_in_m3;
    float volume_out_m3;
    float pressure_psi;
} sensor_snapshot_t;

extern volatile sensor_snapshot_t g_snap;
extern TaskHandle_t g_lcd_task_handle;
extern TaskHandle_t g_poster_task_handle;
```

### LCD Display (`lcd.c`)

4-row layout, updated every 10 seconds (on task notification):

```
Row 0:  IN:   0.0000 m3/h
Row 1:  OUT:  0.0000 m3/h
Row 2:  Vi:0.0000 Vo:0.0000
Row 3:  PRES:   0.00 PSI
```

- I2C mutex ensures ADS1115 and LCD don't collide on the shared bus
- Pinned to Core 1 to avoid preemption by WiFi (Core 0)
- Address auto-detected: tries `0x27` then `0x3F`

### WiFi Manager (`wifi_manager.c`)

- Mode: STA only (no SoftAP, no provisioning portal)
- Auth: `WIFI_AUTH_WPA_WPA2_PSK` (handles WPA2/WPA3 mixed-mode routers)
- Reconnect: `task_wifi_manager` checks every 5 seconds; calls `wifi_connect()` on loss
- No auto-retry in event handler — all reconnection owned by the task to prevent double-connect race
- Timeout: 15 seconds per connection attempt; retries indefinitely

### HTTP Poster (`http_poster.c`)

- Protocol: HTTPS (TLS via `esp_crt_bundle`)
- Endpoint: `POST https://flowsense-server.onrender.com/api/data`
- Interval: 10 seconds (triggered by `snap_refresh` notification; fallback timeout 12 s)
- Retry: 3 attempts, 3-second gap between attempts
- Payload:

```json
{
  "flow_in_m3h":  0.0000,
  "flow_out_m3h": 0.0000,
  "volume_in_m3": 0.0000,
  "volume_out_m3": 0.0000,
  "pressure_psi": 0.00
}
```

### Power Configuration (`sdkconfig.defaults`)

| Setting | Value | Reason |
|---------|-------|--------|
| `CONFIG_NEWLIB_NANO_FORMATTING` | `n` | Enable `%f` in `snprintf` |
| `CONFIG_ESPTOOLPY_FLASHSIZE_4MB` | `y` | 4 MB flash |
| `CONFIG_ESP_BROWNOUT_DET` | `n` | Disabled — cap handles voltage droop |
| `CONFIG_ESP32_PHY_MAX_WIFI_TX_POWER` | `8` (dBm) | Balanced: reliable handshake, reduced spike |
| `CONFIG_ESP32_PHY_CALIBRATION_AND_DATA_STORAGE` | `y` | Cache calibration in NVS after first boot |
| `CONFIG_ESP_INT_WDT` | `n` | Prevents IWDT firing during first-boot calibration |

---

## 5. Server (Backend)

**Runtime:** Node.js ≥ 18  
**Framework:** Express 4.x + TypeScript  
**Database:** MySQL (Aiven hosted)  
**Deployment:** Render (free tier web service)  
**Location:** `server/`

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/data` | Receive sensor reading from ESP32 |
| `GET` | `/api/stream` | SSE stream — browser subscribes for live push |
| `GET` | `/api/data/latest` | Most recent single reading |
| `GET` | `/api/data?limit=N` | Last N readings (max 500) |
| `GET` | `/api/reports/weekly` | Daily summaries from most recent Monday |
| `GET` | `/api/reports/monthly` | Daily summaries from 1st of current month |
| `GET` | `/api/bills` | All generated bills, newest first |
| `GET` | `/api/bills/periods` | Available billing months (from DB) |
| `POST` | `/api/bills/generate` | Generate or regenerate a monthly bill |
| `DELETE` | `/api/bills/:id` | Delete a bill |
| `POST` | `/api/seed` | Bulk-load daily summaries (demo/test data) |
| `GET` | `/api/status` | Health check — uptime and record count |

### POST /api/data

ESP32 sends this every 10 seconds. The server:
1. Stores the reading in the in-memory ring buffer (last 500 entries)
2. Calls `accumulateDaily()` to update `daily_summaries` in MySQL
3. Broadcasts the record to all SSE clients

**Body:**
```json
{
  "flow_in_m3h":  0.0036,
  "flow_out_m3h": 0.0035,
  "volume_in_m3": 0.0012,
  "volume_out_m3": 0.0011,
  "pressure_psi": 2.94
}
```

### POST /api/bills/generate

**Body:**
```json
{
  "period": "2026-04",
  "price_per_m3": 28.50,   // optional — if omitted, tiered billing applies
  "notes": "optional text"
}
```

If `price_per_m3` is omitted, the server automatically applies the tiered rate structure (see Section 8). The stored `price_per_m3` field reflects the effective average rate (`total_cost / volume_in_m3`).

### Daily Accumulation Logic

On each ESP32 POST, the server:
- Detects day boundaries (by comparing `date` string)
- On new day: creates a baseline row (`INSERT IGNORE`)
- Same day: computes positive volume delta (guards against ESP32 reboot reset), updates running totals with `ON DUPLICATE KEY UPDATE`

### SSE (Real-Time Streaming)

Browsers connect to `GET /api/stream`. Each ESP32 POST triggers `broadcast()` which writes the JSON record to all open SSE connections. The last known reading is sent immediately on connect (no blank wait).

### In-Memory Store

Last 500 readings are held in a `SensorReading[]` array. This is volatile (lost on server restart) and used for the live chart on the dashboard. Historical aggregates live in MySQL `daily_summaries`.

---

## 6. Client (Frontend)

**Framework:** Next.js (React) + TypeScript  
**UI Library:** HeroUI + Tailwind CSS  
**State:** Zustand (`sensor-store`) + TanStack Query  
**Location:** `client/`

### Pages

#### Dashboard (`/` — `index.tsx`)

The main live-monitoring page. Connects to the server SSE stream on mount.

**Sections:**
- **Live Readings** — 5 KPI cards: Inlet Flow, Outlet Flow, Inlet Volume, Outlet Volume, Pressure (each with a mini sparkline and trend arrow)
- **Flow Rate — Real-time** — line chart of inlet/outlet flow over the last 60 readings
- **Session Summary** — peak flow IN/OUT, peak pressure, max volume IN, net flow chip
- **Accumulated Volume** — line chart of volume IN/OUT over session
- **Line Pressure** — line chart + gauge bar with Low/Normal/High zones
  - High pressure alert (> 25 PSI): toast notification fires automatically
- **Recent Readings** — scrollable table of the last N readings with timestamp

#### Reports (`/reports` — `reports.tsx`)

Historical usage analysis by calendar period.

**Weekly tab:** Data from the most recent Monday to today (resets every Monday)  
**Monthly tab:** Data from the 1st of the current month to today

**Sections per tab:**
- 4 summary cards: Total Inlet, Total Outlet, Net Consumption, Est. Water Cost
- Bar chart (inlet vs outlet by day)
- Daily Breakdown table with: date, inlet m³, outlet m³, peak flow IN/OUT, peak PSI, est. cost

**Price input:** User-configurable ₱/m³ rate (persisted in `localStorage`). Used only for the client-side cost estimate in reports — does not affect bill generation.

#### Bills (`/bills` — `bills.tsx`)

Monthly billing management.

**Summary cards:** Total Billed, Total Volume, Latest Bill amount  
**Billing History table:** Period, Inlet m³, Outlet m³, Price/m³, Total Cost, Generated date, Notes  
**Generate Bill modal:**
- Select billing period (populated from available months in DB)
- Enter price/m³ (or leave for tiered auto-calculation)
- Optional notes
- Generates or regenerates the bill

**Mobile:** responsive card layout replaces the table on small screens

### Real-Time Data Flow (Client)

```
useSSE() hook
  → GET /api/stream (SSE)
  → on message: parse JSON → useSensorStore.addReading()
  → React re-renders KPI cards, charts, table

useQuery (TanStack)
  → GET /api/data?limit=60 on mount (pre-load history)
  → GET /api/reports/weekly|monthly every 60 s
  → GET /api/bills every 30 s
```

---

## 7. Database Schema

**Engine:** MySQL (Aiven hosted, SSL enabled)  
**Database name:** `flowsense`

### Table: `daily_summaries`

One row per calendar day. Updated in real time as ESP32 POSTs arrive.

```sql
CREATE TABLE daily_summaries (
  `date`            DATE   NOT NULL PRIMARY KEY,
  volume_in_m3      DOUBLE NOT NULL DEFAULT 0,   -- cumulative inlet for the day
  volume_out_m3     DOUBLE NOT NULL DEFAULT 0,   -- cumulative outlet for the day
  reading_count     INT    NOT NULL DEFAULT 0,   -- number of ESP32 posts received
  peak_pressure_psi DOUBLE NOT NULL DEFAULT 0,   -- highest pressure seen
  peak_flow_in_m3h  DOUBLE NOT NULL DEFAULT 0,   -- highest inlet flow rate
  peak_flow_out_m3h DOUBLE NOT NULL DEFAULT 0    -- highest outlet flow rate
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table: `bills`

One row per billing period (month). Generated manually via the dashboard.

```sql
CREATE TABLE bills (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  billing_period CHAR(7)  NOT NULL UNIQUE,     -- "YYYY-MM"
  volume_in_m3   DOUBLE   NOT NULL,
  volume_out_m3  DOUBLE   NOT NULL,
  price_per_m3   DOUBLE   NOT NULL,            -- effective rate (total / volume)
  total_cost     DOUBLE   NOT NULL,
  generated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes          TEXT                          -- tier breakdown auto-populated
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 8. Billing Structure

Tiered rate structure (Philippine water district):

| Tier | Consumption | Charge |
|------|------------|--------|
| 1 | 0 – 10 m³ | ₱259.16 flat (minimum charge) |
| 2 | 11 – 20 m³ | ₱28.64 per m³ above 10 |
| 3 | 21 – 30 m³ | ₱33.71 per m³ above 20 |

**Examples:**

| Consumption | Calculation | Total |
|------------|-------------|-------|
| 10 m³ | ₱259.16 flat | **₱259.16** |
| 15 m³ | ₱259.16 + 5 × ₱28.64 | **₱402.36** |
| 25 m³ | ₱259.16 + 10 × ₱28.64 + 5 × ₱33.71 | **₱714.11** |

When `price_per_m3` is omitted from `POST /api/bills/generate`, this tiered structure is applied automatically. The bill notes field stores the full tier breakdown string.

---

## 9. Configuration Reference

### ESP32 — `flow_a/include/app_config.h`

```c
// WiFi credentials
#define DEFAULT_WIFI_SSID       "Flowsense"
#define DEFAULT_WIFI_PASS       "Flow12345"

// Render server
#define RENDER_SERVER_URL       "https://flowsense-server.onrender.com"

// GPIO
#define FLOW_IN_GPIO            25
#define FLOW_OUT_GPIO           26
#define I2C_SDA_GPIO            21
#define I2C_SCL_GPIO            22
#define I2C_FREQ_HZ             25000   // 25 kHz — conservative for PCF8574

// I2C addresses
#define LCD_ADDR                0x27    // auto-detected at runtime
#define ADS1115_ADDR            0x48

// ADS1115 calibration
#define ADS1115_LSB_MV          0.125f  // PGA ±4.096 V
#define SIG_SCALE_RATIO         0.680f  // voltage divider ratio

// Pressure calibration
#define PRESS_V_MIN             0.5f    // 0 PSI
#define PRESS_V_MAX             4.5f    // 30 PSI
#define PRESS_PSI_MAX           30.0f
#define PRESS_NOISE_OFFSET      5.0f    // coarse zero calibration
#define PRESS_EMA_ALPHA         0.25f   // EMA smoothing weight
#define PRESS_DEADBAND_PSI      3.5f    // below this → 0.0 PSI

// Flow calibration
#define YF_S201_FACTOR          7.5f    // pulses per litre per minute

// Unit conversions
#define LPM_TO_M3H              0.06f   // L/min → m³/h
#define L_TO_M3                 0.001f  // L → m³

// Timing
#define FLOW_TASK_PERIOD_MS     250
#define PRESSURE_TASK_PERIOD_MS 500
#define UPDATE_INTERVAL_MS      10000   // snapshot + POST every 10 s
#define WIFI_RECONNECT_MS       5000    // reconnect check interval

// Demo mode — comment out to use real ADS1115 pressure sensor
#define PRESSURE_DEMO_MODE              // cycles 0.98→1.89→2.94→3.91→4.83 PSI
```

### Server — Environment Variables (Render dashboard)

| Variable | Description |
|----------|-------------|
| `MYSQL_HOST` | Aiven MySQL hostname |
| `MYSQL_PORT` | MySQL port (default 3306) |
| `MYSQL_USER` | Database username |
| `MYSQL_PASSWORD` | Database password |
| `MYSQL_DATABASE` | Database name (`flowsense`) |
| `MYSQL_SSL` | `true` for Aiven (default); `false` for local dev |
| `NODE_ENV` | `production` |
| `PORT` | Set automatically by Render |

### Client — Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SERVER_URL` | Full server URL, e.g. `https://flowsense-server.onrender.com` |

---

## 10. Deployment

### ESP32 Firmware

**Requirements:** PlatformIO, ESP-IDF 5.x toolchain

```bash
# Build
pio run

# Flash + monitor
pio run -t upload && pio device monitor
```

**First boot on new hardware:**
- Full PHY calibration runs (~200 ms) — may cause one brief stutter
- Calibration is cached to NVS; subsequent boots use partial calibration (~5 ms)
- The 470 µF capacitor on the 3V3 rail is required for first-boot stability

### Server (Render)

The server auto-deploys on every `git push` to `main`.

**Build command:** `npm install && npm run build`  
**Start command:** `npm start`

On startup: `initDb()` creates tables if missing and seeds demo data if the `daily_summaries` table is empty.

### Client (Next.js)

```bash
cd client
npm install
npm run dev       # development
npm run build     # production build
npm start         # serve production build
```

Set `NEXT_PUBLIC_SERVER_URL` in `client/.env.local` for local development.

---

## 11. Seeder & Demo Mode

### Seed Script

Loads 12 days of demo data (April 15–26 2026) into the server's `daily_summaries` table.

```bash
cd server

# Seed to production (Render)
npm run seed -- https://flowsense-server.onrender.com

# Seed to local dev server
npm run seed
```

The seed clears all existing `daily_summaries` data (`clear: true`) before inserting.

**Seeded data summary:**
- Period: April 15–26 2026 (12 days)
- Total inlet: **10.000 m³** (meter reading 1442 → 1452)
- Total outlet: **9.700 m³** (97% of inlet — YF-S201 sensor tolerance)
- Pattern: weekdays ≈ 0.770–0.820 m³/day, weekends ≈ 0.880–0.940 m³/day
- Peak pressure: cycles through `[0.98, 1.89, 2.94, 3.91, 4.83]` PSI per day

### Auto-Seed on Empty Database

`server/src/db.ts` seeds automatically at server startup if `daily_summaries` is empty. Stale data from previous seed versions is detected and replaced.

### Pressure Demo Mode (ESP32)

When `#define PRESSURE_DEMO_MODE` is enabled in `app_config.h`, the ESP32 ignores the ADS1115 and cycles through fixed PSI values every 10 seconds:

```
0.98 → 1.89 → 2.94 → 3.91 → 4.83 → 0.98 → ...
```

To restore real sensor readings: comment out `#define PRESSURE_DEMO_MODE` and reflash.

---

## 12. Troubleshooting

### ESP32 not connecting to WiFi

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `reason 201` (NO_AP_FOUND) | SSID not visible / wrong band | Verify 2.4 GHz SSID in `app_config.h` |
| `reason 205` (HANDSHAKE_TIMEOUT) | WPA3 conflict or weak signal | Auth mode is `WIFI_AUTH_WPA_WPA2_PSK`; check TX power |
| `reason 2` (AUTH_EXPIRE) | AP not responding to auth frames | Retry logic handles this automatically |
| `wifi:sta is connected, disconnect first` | Double-connect race | Fixed: event handler no longer calls `esp_wifi_connect()` |

### ESP32 works with USB but not standalone

1. Press the **EN/RST button** on the board after powering from charger
2. If that fixes it: the charger's 5V ramp is too slow for the internal reset circuit
3. Hardware fix: add 100 µF cap between EN pin and GND (slows EN rise → clean reset pulse)
4. The 2-second startup delay in `task_wifi_manager` gives the power rail time to settle

### Server not receiving data (HTTP errors)

| Error | Cause | Fix |
|-------|-------|-----|
| `getaddrinfo() returns 202` | DNS not ready immediately after WiFi connect | Self-resolves on next retry (3 attempts) |
| `select() timeout` | Render free-tier server asleep (cold start ~45 s) | Timeout is set to 45 s to accommodate cold start |
| `ESP_ERR_HTTP_CONNECT` after 3 attempts | Server down or no internet | Check Render dashboard; retries next 10 s cycle |

### Pressure reads non-zero with no water pressure

- **Deadband:** readings below `PRESS_DEADBAND_PSI` (3.5 PSI) are forced to 0.0
- **Noise offset:** `PRESS_NOISE_OFFSET` (5.0 PSI) is subtracted before clamping
- **EMA filter:** `PRESS_EMA_ALPHA = 0.25` smooths rapid fluctuations
- If still non-zero: increase `PRESS_DEADBAND_PSI` or `PRESS_NOISE_OFFSET` in `app_config.h`

### LCD not displaying

1. Check I2C scan output in serial monitor — lists all detected addresses
2. LCD auto-detects `0x27` and `0x3F`; if neither found, check wiring and pull-up resistors
3. I2C bus recovery (9 SCL pulses) runs automatically at startup to clear stuck slaves

### Bills page shows wrong cost estimate

- The Reports page uses the client-side price input (stored in `localStorage`) for the cost column
- The Bills page uses server-computed tiered billing
- These are intentionally separate: Reports shows per-rate estimates; Bills shows official tiered totals

### Weekly report not showing seeded data

The weekly tab shows data from the **most recent Monday to today**. Seeded data covering previous weeks appears only in the **Monthly tab** (which covers the full current month from the 1st).
