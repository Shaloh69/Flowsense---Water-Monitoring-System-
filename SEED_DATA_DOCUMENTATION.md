# Flowsense Seed Data Documentation

## System Flow Direction

```
Mainline / Tank
      │
   [YF-S201 INLET sensor]   ← measures water entering the monitoring system
      │
   [Pipe / System]          ← this section is being monitored
      │
   [YF-S201 OUTLET sensor]  ← measures water leaving the monitoring system
      │
   House distribution
   (faucets, shower, etc.)
```

The Flowsense system sits **between the supply source and the house**.
It is not measuring drain water — it is measuring what enters and exits the
monitored pipe section.

---

## Why Inlet and Outlet Are Different

In a perfectly sealed pipe with perfect sensors, inlet = outlet exactly.
In reality they differ slightly because of:

| Cause | Explanation |
|-------|-------------|
| **Sensor measurement tolerance** | YF-S201 has ±3–5 % accuracy. Two sensors on the same flow will never read identically. |
| **Trapped volume** | Water held inside the pipe segment between the two sensors. When flow starts or stops, the two sensors don't see the same pulse count at the same instant. |
| **Minor pipe leakage** | A small drip between the two sensors would cause inlet to read higher than outlet consistently. |
| **Vibration / false pulses** | The Hall-effect sensor can register a phantom pulse from pipe vibration or water hammer, adding a small count error. |

> **In a healthy system: Inlet ≈ Outlet (within ~5–6 %)**
>
> If Inlet is consistently **much higher** than Outlet (e.g. >10 %), it suggests
> a real leak in the pipe section between the two sensors.
>
> If Outlet is higher than Inlet, it is a sensor fault or wiring error — water
> cannot flow backward through the system under normal conditions.

The seed data uses **Outlet = ~94 % of Inlet** to simulate the realistic
measurement tolerance of two YF-S201 sensors on the same pipe.

---

## Overview

The seed data simulates **14 days** (April 1–14, 2026) for a
**4-person household** in the Philippines connected to a local water district.
The values reflect realistic daily flow patterns, not random numbers.

---

## Household Profile

| Parameter | Value |
|-----------|-------|
| Occupants | 4 people |
| Location | Philippines |
| Supply source | Local water district mainline |
| Average daily inlet | ~680–720 L/day (weekdays) |
| Weekend / holiday | ~850–960 L/day |
| Pressure range | 15–18 PSI — typical local utility supply |
| Peak flow rate | 0.006–0.008 m³/min ≈ 6–8 L/min |

---

## Daily Data Breakdown

### Unit Notes
- `volume_in_m3` — total m³ that passed the **inlet sensor** that day
- `volume_out_m3` — total m³ that passed the **outlet sensor** that day
- `peak_flow_in_m3h` — highest instantaneous flow at the inlet sensor (m³/min)
- `peak_pressure_psi` — highest supply line pressure that day
- `reading_count` — ESP32 POST requests received (~1 every 2 s = 43 200/day max)

---

### April 1 — Holy Wednesday `(Wed)`
```
Inlet: 0.825 m³  |  Outlet: 0.779 m³  |  Difference: 0.046 m³ (5.6 %)
Readings: 40 200  |  Peak flow: 0.0072 m³/min  |  Peak pressure: 16.8 PSI
```
Family arrives home early for Holy Week. Usage is above a normal weekday
because people are home longer — more fixtures used across more hours.

---

### April 2 — Maundy Thursday `(Thu)` — Public Holiday
```
Inlet: 0.868 m³  |  Outlet: 0.820 m³  |  Difference: 0.048 m³ (5.5 %)
Readings: 41 500  |  Peak flow: 0.0075 m³/min  |  Peak pressure: 17.1 PSI
```
Everyone home all day. Morning bath, cooking for a family lunch,
traditional house-cleaning in the afternoon, evening cleanup.
Highest non-Sunday day because usage is distributed across all hours
rather than just morning and evening peaks.

---

### April 3 — Good Friday `(Fri)` — Public Holiday
```
Inlet: 0.558 m³  |  Outlet: 0.527 m³  |  Difference: 0.031 m³ (5.6 %)
Readings: 38 900  |  Peak flow: 0.0054 m³/min  |  Peak pressure: 15.4 PSI
```
**Lowest usage day in the dataset.** Observed as a day of fasting and
prayer in the Philippines. No large meals are cooked, bathing is minimal
by tradition, and people attend church or stay quiet. The supply line sees
very little demand — pressure is at its lowest because almost no fixtures
are open simultaneously.

---

### April 4 — Black Saturday `(Sat)`
```
Inlet: 0.632 m³  |  Outlet: 0.597 m³  |  Difference: 0.035 m³ (5.5 %)
Readings: 39 800  |  Peak flow: 0.0061 m³/min  |  Peak pressure: 16.0 PSI
```
Still quiet but above Good Friday. Families begin preparing food for
Easter Sunday — vegetables rinsed, dishes washed, normal bathing resumes.

---

### April 5 — Easter Sunday `(Sun)`
```
Inlet: 0.957 m³  |  Outlet: 0.904 m³  |  Difference: 0.053 m³ (5.5 %)
Readings: 42 100  |  Peak flow: 0.0083 m³/min  |  Peak pressure: 17.5 PSI
```
**Highest usage day in the dataset.** Extended family visits for a
celebratory lunch. Multiple people bathing simultaneously in the morning
creates the highest peak flow of the 14 days — the kitchen sink and
a bathroom tap running at the same time pushes the inlet sensor to its
daily maximum. More readings because the ESP32 had no reboot gaps this day.

---

### April 6 — Monday `(Mon)` — Back to normal
```
Inlet: 0.671 m³  |  Outlet: 0.634 m³  |  Readings: 40 300
Peak flow: 0.0066 m³/min  |  Peak pressure: 16.5 PSI
```
School and work resume. Flow pattern returns to two peaks:
morning rush (6–8 AM) and evening (5–8 PM).

---

### April 7–10 — Normal Weekdays `(Tue–Fri)`
```
Inlet range: 0.658–0.703 m³/day
```
Standard two-peak daily pattern. Slight day-to-day variation (±20 L)
is normal — a longer shower one morning, an extra load of rinsing another day.

Thursday (Apr 9) is marginally the highest weekday. April is the hottest
month in the Philippines — more water moves through the system as people
drink and bathe more frequently.

---

### April 11 — Saturday `(Sat)` — Laundry Day
```
Inlet: 0.914 m³  |  Outlet: 0.863 m³  |  Difference: 0.051 m³ (5.6 %)
Readings: 42 800  |  Peak flow: 0.0081 m³/min  |  Peak pressure: 17.8 PSI
```
**Highest pressure day.** A semi-automatic washing machine connected
directly to the supply line draws water in fast sustained bursts.
When the washing machine fills while someone is also showering,
both sensors see high simultaneous flow — this is why pressure peaks here.
The supply line is under its greatest demand load of the two weeks.

---

### April 12 — Sunday `(Sun)`
```
Inlet: 0.849 m³  |  Outlet: 0.802 m³  |  Readings: 41 900
Peak flow: 0.0075 m³/min  |  Peak pressure: 17.2 PSI
```
Rest day. Church in the morning (lower flow), then home for the afternoon.
Below Saturday because no laundry machine load.

---

### April 13–14 — Monday–Tuesday
```
Inlet range: 0.661–0.675 m³/day
```
Back to the regular weekday cycle. Matches the Apr 6–7 range closely,
confirming the pattern is consistent across the two weeks.

---

## Weekly Summary

| Week | Dates | Total Inlet | Total Outlet | Difference | Est. Cost (₱28.50/m³) |
|------|-------|-------------|--------------|------------|----------------------|
| Week 1 (Holy Week) | Apr 1–7 | 5.169 m³ | 4.880 m³ | 0.289 m³ | ₱147.32 |
| Week 2 (Normal) | Apr 8–14 | 5.173 m³ | 4.885 m³ | 0.288 m³ | ₱147.43 |
| **14-day total** | | **10.342 m³** | **9.765 m³** | **0.577 m³** | **₱294.75** |

Despite Holy Week containing extreme high (Easter) and extreme low (Good Friday),
both weekly inlet totals are nearly identical (~5.17 m³). The days cancel each other out,
which is consistent with real household data over time.

---

## Reading Count Explanation

```
Theoretical max:  24 h × 60 min × 30 posts/min = 43,200 readings/day
Seed data range:  38,900 – 42,800 readings/day
```

Below theoretical maximum because:
- ESP32 reboots during the day (brownout recovery, power interruption)
- WiFi reconnection gaps (10 s retry loop in firmware)
- Render server cold-start delay (~15 s on free tier while idle)

---

## Water Rate Reference (Philippines)

| Provider | Rate per m³ |
|----------|-------------|
| Manila Water | ₱61.04 |
| Maynilad | ₱65.62 |
| Default in app (basic / rural water district) | ₱28.50 |
