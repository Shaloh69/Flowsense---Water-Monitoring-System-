/**
 * Seed script — loads 12 days (April 15–26 2026) for a 4-person Philippine household.
 * Billing period: April 15–26.  Meter: 1442 → 1452 m³ (10 m³ total consumption).
 *
 * Usage:
 *   npm run seed                                          ← localhost:3000
 *   npm run seed -- https://flowsense-server.onrender.com
 *
 * System layout:
 *   Mainline/Tank → [INLET sensor] → pipe → [OUTLET sensor] → House
 *
 * Outlet ≈ 97 % of inlet — reflects YF-S201 sensor-to-sensor measurement
 * tolerance (rated ±3–5 %) on a healthy pipe with no leaks between sensors.
 *
 * Pressure: cycles through demo sequence [0.98, 1.89, 2.94, 3.91, 4.83] PSI.
 *
 * Tiered billing structure (Philippine water district):
 *   0 – 10 m³ : ₱259.16  (flat)
 *  11 – 20 m³ : ₱28.64 / m³ above 10
 *  21 – 30 m³ : ₱33.71 / m³ above 20
 */

const SERVER_URL = process.argv[2]?.replace(/\/$/, "") ?? "http://localhost:3000";

interface DailySummary {
  date: string;
  volume_in_m3: number;
  volume_out_m3: number;
  reading_count: number;
  peak_pressure_psi: number;
  peak_flow_in_m3h: number;
  peak_flow_out_m3h: number;
}

// Apr 15 = Wednesday.  Weekdays ≈ 0.770–0.820 m³, weekends ≈ 0.880–0.940 m³.
// Sum of volume_in_m3 = exactly 10.000 m³.
// Peak pressure cycles: [0.98, 1.89, 2.94, 3.91, 4.83] (matches ESP32 demo mode).
const days: DailySummary[] = [
  // date           vol_in  vol_out  readings  peak_psi  peak_fin  peak_fout
  { date: "2026-04-15", volume_in_m3: 0.790, volume_out_m3: 0.766, reading_count: 41200, peak_pressure_psi: 0.98, peak_flow_in_m3h: 0.0069, peak_flow_out_m3h: 0.0067 }, // Wed
  { date: "2026-04-16", volume_in_m3: 0.810, volume_out_m3: 0.786, reading_count: 41400, peak_pressure_psi: 1.89, peak_flow_in_m3h: 0.0070, peak_flow_out_m3h: 0.0068 }, // Thu
  { date: "2026-04-17", volume_in_m3: 0.780, volume_out_m3: 0.757, reading_count: 41100, peak_pressure_psi: 2.94, peak_flow_in_m3h: 0.0068, peak_flow_out_m3h: 0.0066 }, // Fri
  { date: "2026-04-18", volume_in_m3: 0.920, volume_out_m3: 0.892, reading_count: 42400, peak_pressure_psi: 3.91, peak_flow_in_m3h: 0.0080, peak_flow_out_m3h: 0.0078 }, // Sat (laundry)
  { date: "2026-04-19", volume_in_m3: 0.900, volume_out_m3: 0.873, reading_count: 42200, peak_pressure_psi: 4.83, peak_flow_in_m3h: 0.0078, peak_flow_out_m3h: 0.0076 }, // Sun
  { date: "2026-04-20", volume_in_m3: 0.800, volume_out_m3: 0.776, reading_count: 41300, peak_pressure_psi: 0.98, peak_flow_in_m3h: 0.0070, peak_flow_out_m3h: 0.0068 }, // Mon
  { date: "2026-04-21", volume_in_m3: 0.770, volume_out_m3: 0.747, reading_count: 41000, peak_pressure_psi: 1.89, peak_flow_in_m3h: 0.0067, peak_flow_out_m3h: 0.0065 }, // Tue
  { date: "2026-04-22", volume_in_m3: 0.790, volume_out_m3: 0.766, reading_count: 41200, peak_pressure_psi: 2.94, peak_flow_in_m3h: 0.0069, peak_flow_out_m3h: 0.0067 }, // Wed
  { date: "2026-04-23", volume_in_m3: 0.820, volume_out_m3: 0.795, reading_count: 41500, peak_pressure_psi: 3.91, peak_flow_in_m3h: 0.0071, peak_flow_out_m3h: 0.0069 }, // Thu
  { date: "2026-04-24", volume_in_m3: 0.800, volume_out_m3: 0.776, reading_count: 41300, peak_pressure_psi: 4.83, peak_flow_in_m3h: 0.0070, peak_flow_out_m3h: 0.0068 }, // Fri
  { date: "2026-04-25", volume_in_m3: 0.940, volume_out_m3: 0.912, reading_count: 42600, peak_pressure_psi: 0.98, peak_flow_in_m3h: 0.0082, peak_flow_out_m3h: 0.0080 }, // Sat (peak)
  { date: "2026-04-26", volume_in_m3: 0.880, volume_out_m3: 0.854, reading_count: 42000, peak_pressure_psi: 1.89, peak_flow_in_m3h: 0.0077, peak_flow_out_m3h: 0.0075 }, // Sun
];

function tieredCost(m3: number): number {
  if (m3 <= 10) return 259.16;
  if (m3 <= 20) return 259.16 + (m3 - 10) * 28.64;
  if (m3 <= 30) return 259.16 + 10 * 28.64 + (m3 - 20) * 33.71;
  return 259.16 + 10 * 28.64 + 10 * 33.71 + (m3 - 30) * 33.71;
}

const totalIn  = days.reduce((s, d) => s + d.volume_in_m3,  0);
const totalOut = days.reduce((s, d) => s + d.volume_out_m3, 0);
const estCost  = tieredCost(totalIn);

console.log(`Seeding ${days.length} days to ${SERVER_URL}/api/seed  (clear=true)`);
console.log(`  Billing period : 2026-04-15 → 2026-04-26`);
console.log(`  Total inlet    : ${totalIn.toFixed(3)} m³  (meter 1442 → 1452)`);
console.log(`  Total outlet   : ${totalOut.toFixed(3)} m³  (${((totalOut / totalIn) * 100).toFixed(1)}% of inlet)`);
console.log(`  Est. cost      : ₱${estCost.toFixed(2)}  (tiered: ₱259.16 flat for ≤10 m³)`);

fetch(`${SERVER_URL}/api/seed`, {
  method:  "POST",
  headers: { "Content-Type": "application/json" },
  body:    JSON.stringify({ days, clear: true }),
})
  .then(async (r) => {
    const body = await r.json();
    if (r.ok) {
      console.log(`\nDone:`, body);
    } else {
      console.error(`\nServer returned ${r.status}:`, body);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("\nFetch failed:", err.message);
    process.exit(1);
  });
