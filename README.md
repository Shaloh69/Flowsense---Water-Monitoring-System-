# Flowsense — Real-Time Residential Water Flow Monitoring System

A full-stack IoT system that measures residential water consumption using an ESP32 microcontroller, streams live sensor data to a cloud server, and presents it through a web dashboard with historical reports and automated billing.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Hardware Layer — ESP32 Firmware](#4-hardware-layer--esp32-firmware)
5. [Backend Layer — Node.js Server](#5-backend-layer--nodejs-server)
6. [Frontend Layer — Next.js Web Dashboard](#6-frontend-layer--nextjs-web-dashboard)
7. [Database Layer — MySQL](#7-database-layer--mysql)
8. [Data Flow — End to End](#8-data-flow--end-to-end)
9. [Deployment](#9-deployment)
10. [Configuration Reference](#10-configuration-reference)

---

## 1. Project Overview

Flowsense addresses the problem of unmonitored residential water consumption. Most households have no way to track daily water usage in real time, detect leaks, or get accurate cost projections before a monthly bill arrives.

The system solves this by:

- **Measuring** inlet and outlet water flow using two Hall-effect flow sensors and line pressure using a ratiometric pressure transducer
- **Processing** raw sensor pulses on an ESP32 microcontroller into meaningful engineering values (flow rate, accumulated volume, pressure)
- **Transmitting** readings over WiFi to a cloud server every 10 seconds
- **Displaying** live and historical data on a web dashboard accessible from any device on the network
- **Generating** monthly water bills using a tiered rate structure modeled on Philippine water utility pricing

The system is entirely self-contained: the ESP32 also drives a local 20×4 LCD display, so readings are available without internet access.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HARDWARE LAYER                              │
│                                                                     │
│   [Water Main]──[Inlet YF-S201]──[House Plumbing]──[Outlet YF-S201]│
│                                        │                            │
│                              [Pressure Transducer]                  │
│                                        │                            │
│                              [Voltage Divider R1/R2]                │
│                                        │                            │
│                              [ADS1115 I2C ADC]                      │
│                                        │                            │
│                  ┌─────────────[ESP32 DevKit v1]──────┐             │
│                  │         (FreeRTOS / ESP-IDF 5.x)   │             │
│           [20×4 LCD]                            [WiFi STA]          │
│        (HD44780 / PCF8574)                           │              │
└─────────────────────────────────────────────────────────────────────┘
                                                       │ HTTPS POST
                                                       │ every 10 s
┌──────────────────────────────────────────────────────┼─────────────┐
│                        BACKEND LAYER                 ↓             │
│                                                                     │
│              [Express / Node.js Server — TypeScript]                │
│                         hosted on Render                            │
│                                                                     │
│    POST /api/data ──→ accumulate daily_summaries ──→ broadcast SSE │
│    GET  /api/stream  ←── SSE push to browsers                      │
│    GET  /api/reports/weekly|monthly                                 │
│    POST /api/bills/generate  ←── tiered billing engine             │
│                         │                                           │
│              [MySQL Database — Aiven Cloud]                         │
│              tables: daily_summaries, bills                         │
└─────────────────────────────────────────────────────────────────────┘
                                │ SSE stream + REST
┌───────────────────────────────┼─────────────────────────────────────┐
│                    FRONTEND LAYER                 ↓                 │
│                                                                     │
│          [Next.js 15 + React 18 — TypeScript]                       │
│                                                                     │
│  /            Dashboard   — live KPI cards, charts, sparklines      │
│  /reports     Reports     — weekly / monthly bar charts + tables    │
│  /bills       Bills       — tiered billing, history, PDF export     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### 3.1 Firmware

| Tool / Technology | Version | Role |
|-------------------|---------|------|
| **C (ISO C99)** | — | Firmware implementation language |
| **ESP-IDF** | 5.x | Espressif IoT Development Framework — WiFi, I2C, GPIO, HTTPS, FreeRTOS APIs |
| **FreeRTOS** | (bundled with ESP-IDF) | Real-time operating system — concurrent tasks, mutexes, task notifications |
| **PlatformIO** | latest | Build system, upload tool, serial monitor; wraps the ESP-IDF toolchain |
| **espressif32** | platform package | PlatformIO board support package for ESP32 chips |
| **esp_crt_bundle** | (ESP-IDF component) | Embedded TLS certificate bundle for HTTPS without manual cert management |
| **esp_http_client** | (ESP-IDF component) | HTTP/HTTPS client used for POSTing sensor data to Render |
| **esp_wifi** | (ESP-IDF component) | WiFi STA mode, WPA2/WPA3 mixed-mode authentication |
| **driver/i2c** | (ESP-IDF component) | Legacy I2C master API for ADS1115 and LCD |

### 3.2 Backend

| Tool / Technology | Version | Role |
|-------------------|---------|------|
| **Node.js** | ≥ 18.0.0 | JavaScript runtime for the server |
| **TypeScript** | ^6.0.2 | Statically typed superset of JavaScript — all server source is `.ts` |
| **Express** | ^4.18.2 | HTTP web framework — routing, middleware, request/response handling |
| **mysql2** | ^3.11.0 | MySQL driver for Node.js with promise interface and connection pooling |
| **cors** | ^2.8.5 | Express middleware for Cross-Origin Resource Sharing headers |
| **ts-node** | ^10.9.2 | TypeScript execution for development (`npm run dev`) and the seed script |
| **nodemon** | ^3.0.1 | File watcher that restarts ts-node automatically during development |
| **tsc** | (TypeScript CLI) | Compiles TypeScript to JavaScript for the production build in `dist/` |

### 3.3 Frontend

| Tool / Technology | Version | Role |
|-------------------|---------|------|
| **Next.js** | 15.5.9 | React framework — file-based routing, SSR, static export, Turbopack dev bundler |
| **React** | 18.3.1 | UI component library — declarative rendering, hooks |
| **TypeScript** | 5.6.3 | Type safety across all component and page files |
| **Tailwind CSS** | 4.1.11 | Utility-first CSS framework for all styling |
| **HeroUI** | 2.x | Pre-built accessible React component library (tabs, cards, spinners, toasts, tables, etc.) |
| **TanStack Query** | ^5.90.20 | Data fetching and caching — REST queries with automatic refetch intervals |
| **Zustand** | ^5.0.11 | Lightweight global state store — holds live sensor readings and session data |
| **Framer Motion** | 11.18.2 | Animation library — smooth transitions and micro-interactions on UI elements |
| **next-themes** | 0.4.6 | Theme provider for dark/light mode switching |
| **ESLint** | ^9.25.1 | Static analysis and linting — enforces code quality rules |
| **Prettier** | ^3.5.3 | Opinionated code formatter for consistent style |
| **PostCSS** | 8.5.6 | CSS post-processor (required by Tailwind CSS 4) |

### 3.4 Database

| Tool / Technology | Role |
|-------------------|------|
| **MySQL 8** | Relational database — stores `daily_summaries` and `bills` tables |
| **Aiven** | Managed MySQL cloud hosting with automatic SSL/TLS |

### 3.5 Cloud & DevOps

| Tool / Technology | Role |
|-------------------|------|
| **Render** | PaaS hosting for the Node.js server — auto-deploys on every `git push` to `main` |
| **Git / GitHub** | Version control and source of truth for CI/CD triggering |

---

## 4. Hardware Layer — ESP32 Firmware

**Language:** C  
**Framework:** ESP-IDF 5.x  
**Build tool:** PlatformIO (`platformio.ini`)  
**Location:** `flow_a/`

### 4.1 Hardware Components

| Component | Model | Purpose |
|-----------|-------|---------|
| Microcontroller | ESP32 DevKit v1 | Central controller, WiFi STA, GPIO, I2C master |
| Flow Sensor × 2 | YF-S201 Hall-effect | Pulse counting for inlet and outlet water lines |
| Pressure Transducer | 0–30 PSI ratiometric | Line pressure measurement (0.5–4.5 V output) |
| ADC | ADS1115 16-bit I2C | Converts pressure voltage to digital counts |
| LCD Display | 20×4 HD44780 + PCF8574 | Local real-time readout without internet |
| Voltage Divider | R1 = 4.7 kΩ, R2 = 10 kΩ | Scales 4.5 V sensor output to 3.06 V for ADS1115 |
| Stabilization Cap | 470 µF electrolytic | Absorbs the ~400 mA current spike during WiFi phy_init |
| Power Supply | 5 V / 3 A USB charger | Standalone operation without a PC |

### 4.2 Firmware File Structure

```
flow_a/
├── platformio.ini              ← PlatformIO build config (board, framework, flags)
├── sdkconfig.defaults          ← ESP-IDF KConfig overrides (flash size, PHY power, etc.)
├── include/
│   ├── app_config.h            ← All pins, calibration constants, WiFi credentials
│   ├── flow_sensor.h           ← YF-S201 pulse counting API
│   ├── pressure_sensor.h       ← ADS1115 + PSI conversion API
│   ├── sensor_snapshot.h       ← Shared sensor_snapshot_t struct + task handles
│   ├── lcd.h                   ← 20×4 HD44780 display API
│   ├── http_poster.h           ← HTTPS POST to Render server
│   └── wifi_manager.h          ← WiFi STA connection management API
└── src/
    ├── main.c                  ← app_main: init sequence + FreeRTOS task creation
    ├── flow_sensor.c           ← GPIO ISR pulse counting, L/min, cumulative volume
    ├── pressure_sensor.c       ← ADS1115 I2C driver, EMA filter, PSI conversion
    ├── sensor_snapshot.c       ← Global snapshot variable definition
    ├── lcd.c                   ← HD44780 driver via I2C PCF8574 expander
    ├── http_poster.c           ← HTTPS POST with retry, JSON serialization
    └── wifi_manager.c          ← WiFi STA init, connect, reconnect task
```

### 4.3 Startup Sequence

The `app_main()` function runs on boot and executes the following sequence before handing control to FreeRTOS:

```
1. nvs_flash_init()          — Initializes Non-Volatile Storage for PHY calibration caching
2. flow_sensor_init()        — Installs GPIO ISRs on GPIO 25 and 26 for both flow sensors
3. pressure_sensor_init()    — Runs I2C bus recovery (9 SCL pulses), installs I2C driver,
                               creates shared I2C mutex for ADS1115 + LCD bus
4. lcd_init()                — I2C address scan (0x27 / 0x3F), HD44780 reset, splash screen
5. wifi_init()               — Allocates WiFi stack memory (no RF activity yet)
6. xTaskCreate(task_sensor_refresh) — Master sensor reading task
7. xTaskCreate(task_wifi_manager)   — WiFi connection + HTTP poster task
```

### 4.4 FreeRTOS Task Architecture

| Task | Core | Priority | Stack | Period | Responsibility |
|------|------|----------|-------|--------|----------------|
| `flow_task` | 1 | 5 | 2 KB | 250 ms | Compute L/min from pulse delta; accumulate volume |
| `pressure_task` | 1 | 5 | 2 KB | 500 ms | Single-shot ADS1115 read; apply EMA filter |
| `task_sensor_refresh` | any | 4 | 2 KB | 10 s | Copy sensor values to `g_snap`; notify LCD and poster |
| `lcd_task` | 1 | 4 | 3 KB | on notify | Write 4 rows to HD44780 LCD |
| `task_http_poster` | any | 3 | 8 KB | on notify | Serialize `g_snap` to JSON; POST to Render server |
| `task_wifi_manager` | any | 3 | 4 KB | 5 s | Monitor WiFi state; reconnect if disconnected |

Tasks communicate using **FreeRTOS task notifications** (`xTaskNotifyGive` / `ulTaskNotifyTake`). `task_sensor_refresh` reads all sensors into the global `sensor_snapshot_t g_snap` struct, then notifies both `lcd_task` and `task_http_poster` simultaneously — ensuring the LCD and the web dashboard always show identical values.

### 4.5 Flow Measurement

**Sensor:** YF-S201 Hall-effect flow sensor  
**Principle:** A spinning rotor inside the sensor generates a pulse train on its signal wire. The pulse frequency is proportional to flow rate.

**Signal conditioning:** The sensor's 5 V output is stepped down to 3.3 V through a 1 kΩ / 2 kΩ resistor voltage divider before connecting to the ESP32 GPIO pin.

**Pulse counting:** GPIO interrupts (rising edge) increment a `volatile uint32_t` counter protected by a FreeRTOS critical section.

**Rate calculation (every 250 ms):**
```
delta_pulses = current_count − last_snapshot_count
frequency_hz = delta_pulses / 0.250
flow_lpm     = frequency_hz / 7.5         (YF-S201 calibration factor)
flow_m3h     = flow_lpm × 0.06            (unit conversion for JSON / LCD)
volume_L    += (flow_lpm / 60.0) × 0.250  (integrate over time step)
volume_m3    = volume_L × 0.001
```

### 4.6 Pressure Measurement

**Sensor:** 0–30 PSI ratiometric transducer (0.5 V at 0 PSI, 4.5 V at 30 PSI)  
**ADC:** ADS1115 16-bit I2C ADC at address `0x48` (ADDR tied to GND)  
**PGA setting:** ±4.096 V → LSB = 0.125 mV

**Voltage divider** (R1 = 4.7 kΩ, R2 = 10 kΩ) scales the 0–4.5 V transducer output down to 0–3.06 V, which fits within the ADS1115 input range safely.

**Conversion chain:**
```
raw_counts  →  V_adc     = raw × 0.000125 V
V_adc       →  V_sensor  = V_adc / 0.680        (undo voltage divider)
V_sensor    →  PSI_raw   = (V_sensor − 0.5) / 4.0 × 30.0
PSI_raw     →  PSI_adj   = PSI_raw − 5.0         (zero-offset calibration)
PSI_adj     →  clamp to [0, 30]
→ EMA filter:  PSI_filtered = 0.25 × PSI_adj + 0.75 × PSI_previous
→ Deadband:    if PSI_filtered < 3.5 → output 0.00 PSI
```

The EMA (Exponential Moving Average) filter and deadband threshold suppress electrical noise and prevent false non-zero readings when the water line has no active pressure.

### 4.7 WiFi Management

The `wifi_manager.c` module manages the station-mode WiFi connection:

- **Auth mode:** `WIFI_AUTH_WPA_WPA2_PSK` — compatible with WPA2-only and WPA2/WPA3 mixed-mode routers
- **Reconnect strategy:** `task_wifi_manager` polls every 5 seconds. On loss of connection, it calls `esp_wifi_disconnect()`, waits 200 ms, then calls `esp_wifi_connect()` — avoiding the double-connect race condition that occurs if the event handler and the task both attempt to reconnect simultaneously
- **TX power:** 8 dBm (increased from default 2 dBm to ensure reliable WPA2 4-way handshake at distance)
- **PHY calibration:** Cached to NVS after first boot; subsequent boots perform partial calibration only (~5 ms vs ~200 ms)

### 4.8 HTTP Poster

`http_poster.c` serializes the sensor snapshot to JSON and sends it to the Render server over HTTPS every 10 seconds.

- **TLS:** `esp_crt_bundle` provides the full CA bundle without manual certificate management
- **Timeout:** 45 seconds — Render free-tier servers have a ~45 second cold-start time after being idle
- **Retry:** 3 attempts with a 3-second gap between each attempt
- **Payload:**
```json
{
  "flow_in_m3h":  0.0036,
  "flow_out_m3h": 0.0035,
  "volume_in_m3": 0.0124,
  "volume_out_m3": 0.0120,
  "pressure_psi": 2.94
}
```

---

## 5. Backend Layer — Node.js Server

**Runtime:** Node.js ≥ 18  
**Language:** TypeScript (compiled to JavaScript for production)  
**Framework:** Express 4.x  
**Location:** `server/`

### 5.1 File Structure

```
server/
├── package.json            ← dependencies, scripts (build / start / dev / seed)
├── tsconfig.json           ← TypeScript compiler options (strict, ES2020, outDir: dist)
├── scripts/
│   ├── seed.ts             ← Standalone seeder script (loads 12 days of demo data)
│   └── tsconfig.json       ← Separate tsconfig for ts-node (adds DOM + node types)
└── src/
    ├── server.ts           ← Express app: all routes, SSE logic, accumulation
    └── db.ts               ← MySQL connection pool, auto-migrate, auto-seed
```

### 5.2 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/data` | Receive a sensor reading from the ESP32 |
| `GET` | `/api/stream` | Server-Sent Events stream for browser live updates |
| `GET` | `/api/data/latest` | Return the most recent single reading |
| `GET` | `/api/data?limit=N` | Return the last N readings from the in-memory buffer |
| `GET` | `/api/reports/weekly` | Daily summaries from the most recent Monday to today |
| `GET` | `/api/reports/monthly` | Daily summaries from the 1st of the current month to today |
| `GET` | `/api/bills` | All generated bills, newest first |
| `GET` | `/api/bills/periods` | Available billing months derived from daily_summaries |
| `POST` | `/api/bills/generate` | Generate or regenerate a monthly bill with tiered pricing |
| `DELETE` | `/api/bills/:id` | Delete a bill record |
| `POST` | `/api/seed` | Bulk-load daily summaries (used by the seed script) |
| `GET` | `/api/status` | Health check — server uptime and row counts |

### 5.3 How POST /api/data Works

When the ESP32 sends a reading, the server performs three operations:

1. **Ring buffer insert** — the reading is pushed into a `SensorReading[]` array capped at 500 entries. This is an in-memory store used for the live dashboard history chart
2. **Daily accumulation** — `accumulateDaily()` computes positive volume deltas (guards against resets from ESP32 reboots) and upserts into the `daily_summaries` MySQL table using `ON DUPLICATE KEY UPDATE`
3. **SSE broadcast** — `broadcast()` writes the serialized reading to every open browser SSE connection

### 5.4 Server-Sent Events (SSE)

Browsers connect to `GET /api/stream` with a persistent HTTP connection. The server keeps each connection open and writes `data: {...}\n\n` frames whenever a new ESP32 reading arrives. On initial connect, the server immediately sends the last known reading so the client does not show a blank state.

SSE was chosen over WebSockets because:
- It is unidirectional (server → browser only), which matches the data flow
- It uses plain HTTP (no upgrade handshake) — works through Render's proxy without configuration
- Native browser `EventSource` API requires no library

### 5.5 Daily Accumulation Logic

The `daily_summaries` table stores one row per calendar day. The accumulation logic:

```
1. Extract today's date string from server time
2. INSERT IGNORE INTO daily_summaries (date, ...) VALUES (today, 0, 0, ...)
   — Creates baseline row if the day does not exist yet
3. Compute positive deltas:
   delta_in  = MAX(0, new_volume_in  − last_volume_in)
   delta_out = MAX(0, new_volume_out − last_volume_out)
   — Positive guard prevents double-counting when ESP32 reboots and volume resets to 0
4. UPDATE daily_summaries SET
     volume_in_m3      = volume_in_m3  + delta_in,
     volume_out_m3     = volume_out_m3 + delta_out,
     reading_count     = reading_count + 1,
     peak_pressure_psi = GREATEST(peak_pressure_psi, ?),
     peak_flow_in_m3h  = GREATEST(peak_flow_in_m3h,  ?),
     peak_flow_out_m3h = GREATEST(peak_flow_out_m3h, ?)
   WHERE date = today
```

### 5.6 Report Date Cutoffs

The weekly and monthly endpoints use calendar-aligned cutoff dates rather than rolling windows:

- **Weekly:** Starts from the most recent Monday (calculated via `getDay()` offset)
- **Monthly:** Starts from the 1st of the current calendar month

This means both tabs reset at natural calendar boundaries, matching how utility bills and household routines are typically tracked.

### 5.7 Tiered Billing Engine

When `POST /api/bills/generate` is called without a `price_per_m3` value, the server applies the tiered rate structure automatically:

| Tier | Volume | Charge |
|------|--------|--------|
| 1 | 0 – 10 m³ | ₱259.16 flat (minimum charge) |
| 2 | 11 – 20 m³ | ₱28.64 per additional m³ |
| 3 | 21 – 30 m³ | ₱33.71 per additional m³ |

The stored `price_per_m3` field in the `bills` table reflects the **effective average rate** (`total_cost ÷ volume_in_m3`), and the `notes` field stores the full tier breakdown string for transparency.

### 5.8 Auto-Migration and Seeding

`db.ts` runs `initDb()` on every server startup:

1. `CREATE TABLE IF NOT EXISTS daily_summaries (...)` — idempotent schema creation
2. `CREATE TABLE IF NOT EXISTS bills (...)` — idempotent schema creation
3. **Seed check:** if `daily_summaries` is empty (or contains stale demo data from a previous version), it inserts 12 days of April 2026 demo data matching a realistic 4-person Philippine household

This means the server is fully self-initializing on first deploy — no manual database setup required.

---

## 6. Frontend Layer — Next.js Web Dashboard

**Framework:** Next.js 15 (React 18)  
**Language:** TypeScript  
**Styling:** Tailwind CSS 4  
**Location:** `client/`

### 6.1 Pages

#### Dashboard (`/` — `pages/index.tsx`)

The real-time monitoring page. Subscribes to the server SSE stream on mount via the `useSSE()` hook.

**Sections:**
- **Live KPI Cards** — 5 metric cards (Inlet Flow, Outlet Flow, Inlet Volume, Outlet Volume, Pressure) each with a sparkline chart and trend arrow
- **Flow Rate Chart** — line chart of inlet and outlet flow over the last 60 readings, rendered as an inline SVG
- **Session Summary** — peak values for flow IN/OUT, pressure, and max volume; Net Flow chip indicating whether inlet exceeds outlet
- **Accumulated Volume Chart** — line chart showing how total volume IN/OUT has grown over the session
- **Line Pressure Gauge** — line chart with colored Low / Normal / High bands; toast notification fires automatically if pressure exceeds 25 PSI
- **Recent Readings Table** — scrollable table of the last N readings with ISO timestamps

#### Reports (`/reports` — `pages/reports.tsx`)

Historical usage analysis by calendar period.

**Weekly tab:** Shows daily summaries from the most recent Monday to today  
**Monthly tab:** Shows daily summaries from the 1st of the current month to today

**Sections:**
- **Summary cards** — Total Inlet, Total Outlet, Net Consumption, Estimated Water Cost
- **Bar chart** — inlet vs. outlet volume per day (custom SVG bar chart, no external chart library)
- **Daily Breakdown table** — date, inlet m³, outlet m³, peak flow IN/OUT, peak pressure PSI, estimated cost

**Price input:** The user can enter a custom ₱/m³ rate stored in `localStorage`. This drives the cost column in the reports view independently from the tiered billing on the Bills page.

#### Bills (`/bills` — `pages/bills.tsx`)

Monthly billing management page.

**Summary cards** — Total Billed (all time), Total Volume Billed, Latest Bill  
**Billing History table** — one row per generated bill: period, volumes, effective rate, total cost, date generated, notes  
**Generate Bill modal** — select a billing period, optionally enter a custom rate (leave blank for automatic tiered billing), add notes

### 6.2 State Management

| Mechanism | Library | Used For |
|-----------|---------|----------|
| Server state | TanStack Query | Fetching and caching reports, bills data with automatic refetch intervals (60 s for reports, 30 s for bills) |
| Global live state | Zustand (`useSensorStore`) | Holds the live readings array, session summary stats, SSE connection status |
| Local UI state | React `useState` | Tab selection, modal open/close, form inputs |
| Client persistence | `localStorage` | User-configured price per m³ for report cost estimates |

### 6.3 Real-Time Data Flow (Client Side)

```
useSSE() hook
  ├── Creates EventSource → GET /api/stream
  ├── On "message": parses JSON → useSensorStore.addReading(reading)
  │     → updates all KPI cards, charts, session summary
  └── On reconnect: automatically restores connection after network interruption

useQuery (TanStack Query)
  ├── GET /api/data?limit=60 on mount (pre-loads history for charts)
  ├── GET /api/reports/weekly every 60 s
  ├── GET /api/reports/monthly every 60 s
  └── GET /api/bills every 30 s
```

### 6.4 Chart Implementation

All charts are implemented as custom inline SVG components (no third-party chart library):

- **`BarChart.tsx`** — grouped bar chart with configurable series, axis labels, and hover tooltips
- **`LineChart.tsx`** — polyline-based chart with optional shaded fill area and axis labels
- **Sparklines** — minimal inline SVG trend lines rendered directly in KPI cards

This approach eliminates a large charting dependency and gives full visual control over the dark glass-morphism design theme.

---

## 7. Database Layer — MySQL

**Host:** Aiven managed MySQL (cloud)  
**Connection:** SSL/TLS enabled (`rejectUnauthorized: false` for Aiven's self-signed cert)  
**Connection pool:** 5 connections (sufficient for Render free-tier single instance)

### Table: `daily_summaries`

One row per calendar day. Updated continuously as ESP32 readings arrive.

```sql
CREATE TABLE daily_summaries (
  `date`            DATE   NOT NULL PRIMARY KEY,
  volume_in_m3      DOUBLE NOT NULL DEFAULT 0,   -- cumulative inlet that day (m³)
  volume_out_m3     DOUBLE NOT NULL DEFAULT 0,   -- cumulative outlet that day (m³)
  reading_count     INT    NOT NULL DEFAULT 0,   -- number of ESP32 POST requests received
  peak_pressure_psi DOUBLE NOT NULL DEFAULT 0,   -- max pressure observed that day
  peak_flow_in_m3h  DOUBLE NOT NULL DEFAULT 0,   -- max inlet flow rate that day
  peak_flow_out_m3h DOUBLE NOT NULL DEFAULT 0    -- max outlet flow rate that day
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Table: `bills`

One row per billing period. Generated on demand via the dashboard.

```sql
CREATE TABLE bills (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  billing_period CHAR(7)  NOT NULL UNIQUE,     -- "YYYY-MM" format
  volume_in_m3   DOUBLE   NOT NULL,
  volume_out_m3  DOUBLE   NOT NULL,
  price_per_m3   DOUBLE   NOT NULL,            -- effective average rate
  total_cost     DOUBLE   NOT NULL,            -- computed total in PHP
  generated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes          TEXT                          -- tier breakdown or user notes
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 8. Data Flow — End to End

This section describes the complete journey of a single sensor reading through all layers of the system.

### Step 1 — Sensor Reading (ESP32, every 250–500 ms)

The `flow_task` counts pulses from both YF-S201 sensors via GPIO interrupts and computes instantaneous flow rate and total volume every 250 ms. The `pressure_task` triggers a single-shot ADS1115 conversion every 500 ms, applies the noise offset, EMA filter, and deadband, and stores the filtered PSI value.

### Step 2 — Snapshot (ESP32, every 10 s)

`task_sensor_refresh` reads all current values atomically into `sensor_snapshot_t g_snap` and sends a FreeRTOS task notification to both `lcd_task` and `task_http_poster`.

### Step 3 — Local Display (ESP32, on notification)

`lcd_task` wakes on the notification and writes four rows to the 20×4 LCD:
```
IN:   0.0036 m3/h
OUT:  0.0035 m3/h
Vi:0.0124 Vo:0.0120
PRES:   2.94 PSI
```

### Step 4 — HTTPS POST (ESP32 → Render, on notification)

`task_http_poster` wakes on the same notification, serializes `g_snap` to JSON, and sends it over HTTPS to `POST https://flowsense-server.onrender.com/api/data`. The request includes the full CA bundle via `esp_crt_bundle` and retries up to 3 times on failure.

### Step 5 — Server Ingestion (Node.js server)

Express receives the POST, validates the JSON body, then:
1. Pushes the reading into the 500-entry ring buffer
2. Calls `accumulateDaily()` to upsert the running daily totals into MySQL
3. Calls `broadcast()` to push the reading to all connected SSE clients

### Step 6 — Browser Update (Next.js client)

Every connected browser receives the SSE frame within milliseconds of the ESP32 POST. The `useSSE()` hook parses the JSON and calls `useSensorStore.addReading()`. Zustand updates the store, React re-renders the KPI cards, appends the new point to the live charts, and updates the session summary.

### Step 7 — Historical Access

Any time the user opens the Reports or Bills page, TanStack Query fetches the pre-aggregated data from `GET /api/reports/weekly` or `GET /api/reports/monthly`, which query the `daily_summaries` table in MySQL. Bills are fetched from the `bills` table and rendered in the billing history.

---

## 9. Deployment

### ESP32

**Requirements:** PlatformIO Core (CLI or IDE extension), ESP-IDF 5.x toolchain (auto-installed by PlatformIO)

```bash
cd flow_a

# Build only
pio run

# Flash to board and open serial monitor
pio run -t upload
pio device monitor
```

Edit `flow_a/include/app_config.h` to change WiFi credentials or server URL before flashing.

### Server (Render)

The server deploys automatically when changes are pushed to `main` on GitHub.

**Build command (Render setting):** `npm install && npm run build`  
**Start command (Render setting):** `npm start`

Set the following environment variables in the Render dashboard:

```
MYSQL_HOST       = <aiven hostname>
MYSQL_PORT       = 3306
MYSQL_USER       = <username>
MYSQL_PASSWORD   = <password>
MYSQL_DATABASE   = flowsense
MYSQL_SSL        = true
NODE_ENV         = production
```

The server self-initializes the database schema on every startup — no manual SQL migration needed.

### Client (Next.js)

```bash
cd client
npm install

# Development
npm run dev

# Production build
npm run build
npm start
```

Create `client/.env.local` for local development:
```
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

For production deployment, set `NEXT_PUBLIC_SERVER_URL` to the Render server URL.

### Seed Script (Demo Data)

```bash
cd server

# Seed local dev server
npm run seed

# Seed production server
npm run seed -- https://flowsense-server.onrender.com
```

This loads 12 days of demo data (April 15–26, 2026) into `daily_summaries`, representing a realistic 4-person Philippine household with 10 m³ total inlet consumption.

---

## 10. Configuration Reference

### ESP32 — `flow_a/include/app_config.h`

All firmware constants are centralized in this single header file. Changing WiFi credentials, recalibrating sensors, or adjusting timing requires editing only this file before reflashing.

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_WIFI_SSID` | `"Flowsense"` | WiFi network name |
| `DEFAULT_WIFI_PASS` | `"Flow12345"` | WiFi password |
| `RENDER_SERVER_URL` | `"https://..."` | HTTPS POST destination |
| `FLOW_IN_GPIO` | `25` | Inlet YF-S201 pulse pin |
| `FLOW_OUT_GPIO` | `26` | Outlet YF-S201 pulse pin |
| `I2C_SDA_GPIO` | `21` | Shared I2C SDA |
| `I2C_SCL_GPIO` | `22` | Shared I2C SCL |
| `I2C_FREQ_HZ` | `25000` | Conservative 25 kHz for PCF8574 over long wires |
| `ADS1115_ADDR` | `0x48` | ADS1115 I2C address |
| `LCD_ADDR` | `0x27` | PCF8574 I2C address (auto-detected) |
| `YF_S201_FACTOR` | `7.5` | Flow sensor calibration (pulses per L/min) |
| `PRESS_V_MIN` | `0.5` | Transducer voltage at 0 PSI |
| `PRESS_V_MAX` | `4.5` | Transducer voltage at 30 PSI |
| `PRESS_NOISE_OFFSET` | `5.0` | Zero-offset subtraction (PSI) |
| `PRESS_EMA_ALPHA` | `0.25` | EMA smoothing weight (0 = no update, 1 = no memory) |
| `PRESS_DEADBAND_PSI` | `3.5` | Readings below this are forced to 0.0 |
| `UPDATE_INTERVAL_MS` | `10000` | Snapshot + POST interval (ms) |
| `WIFI_RECONNECT_MS` | `5000` | WiFi health check interval (ms) |
| `PRESSURE_DEMO_MODE` | *(define/undef)* | When defined: cycles 0.98→1.89→2.94→3.91→4.83 PSI instead of reading ADS1115 |

### Server — Render Environment Variables

| Variable | Description |
|----------|-------------|
| `MYSQL_HOST` | Aiven MySQL hostname |
| `MYSQL_PORT` | MySQL port (3306) |
| `MYSQL_USER` | Database username |
| `MYSQL_PASSWORD` | Database password |
| `MYSQL_DATABASE` | Database name (`flowsense`) |
| `MYSQL_SSL` | `true` for Aiven; `false` for local dev without SSL |
| `NODE_ENV` | `production` |

### Client — Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SERVER_URL` | Full server base URL (e.g. `https://flowsense-server.onrender.com`) |
