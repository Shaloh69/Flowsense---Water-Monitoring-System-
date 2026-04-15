/**
 * Seed script — loads 14 days of corrected data for a 4-person Philippine household.
 * Passes clear:true so it deletes old data before inserting.
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

const days: DailySummary[] = [
  // Holy Wednesday — family arrives home early for Holy Week
  { date: "2026-04-01", volume_in_m3: 0.825, volume_out_m3: 0.800, reading_count: 40200, peak_pressure_psi: 16.8, peak_flow_in_m3h: 0.0072, peak_flow_out_m3h: 0.0070 },
  // Maundy Thursday — PH public holiday, everyone home
  { date: "2026-04-02", volume_in_m3: 0.868, volume_out_m3: 0.842, reading_count: 41500, peak_pressure_psi: 17.1, peak_flow_in_m3h: 0.0075, peak_flow_out_m3h: 0.0073 },
  // Good Friday — fasting, prayer, minimal activity (lowest day)
  { date: "2026-04-03", volume_in_m3: 0.558, volume_out_m3: 0.541, reading_count: 38900, peak_pressure_psi: 15.4, peak_flow_in_m3h: 0.0054, peak_flow_out_m3h: 0.0052 },
  // Black Saturday — quiet, some pre-Easter food prep resumes
  { date: "2026-04-04", volume_in_m3: 0.632, volume_out_m3: 0.613, reading_count: 39800, peak_pressure_psi: 16.0, peak_flow_in_m3h: 0.0061, peak_flow_out_m3h: 0.0059 },
  // Easter Sunday — family lunch with guests (highest day)
  { date: "2026-04-05", volume_in_m3: 0.957, volume_out_m3: 0.928, reading_count: 42100, peak_pressure_psi: 17.5, peak_flow_in_m3h: 0.0083, peak_flow_out_m3h: 0.0081 },
  // Monday — school and work resume, two-peak pattern resumes
  { date: "2026-04-06", volume_in_m3: 0.671, volume_out_m3: 0.651, reading_count: 40300, peak_pressure_psi: 16.5, peak_flow_in_m3h: 0.0066, peak_flow_out_m3h: 0.0064 },
  { date: "2026-04-07", volume_in_m3: 0.658, volume_out_m3: 0.638, reading_count: 39900, peak_pressure_psi: 15.8, peak_flow_in_m3h: 0.0064, peak_flow_out_m3h: 0.0062 },
  { date: "2026-04-08", volume_in_m3: 0.681, volume_out_m3: 0.661, reading_count: 40700, peak_pressure_psi: 16.2, peak_flow_in_m3h: 0.0067, peak_flow_out_m3h: 0.0065 },
  // Thursday — peak summer heat, slightly more water used
  { date: "2026-04-09", volume_in_m3: 0.703, volume_out_m3: 0.682, reading_count: 41200, peak_pressure_psi: 16.7, peak_flow_in_m3h: 0.0070, peak_flow_out_m3h: 0.0068 },
  { date: "2026-04-10", volume_in_m3: 0.690, volume_out_m3: 0.669, reading_count: 40500, peak_pressure_psi: 16.4, peak_flow_in_m3h: 0.0068, peak_flow_out_m3h: 0.0066 },
  // Saturday — laundry day, washing machine drives highest pressure (17.8 PSI)
  { date: "2026-04-11", volume_in_m3: 0.914, volume_out_m3: 0.887, reading_count: 42800, peak_pressure_psi: 17.8, peak_flow_in_m3h: 0.0081, peak_flow_out_m3h: 0.0079 },
  // Sunday — rest day, church in morning then home
  { date: "2026-04-12", volume_in_m3: 0.849, volume_out_m3: 0.823, reading_count: 41900, peak_pressure_psi: 17.2, peak_flow_in_m3h: 0.0075, peak_flow_out_m3h: 0.0073 },
  { date: "2026-04-13", volume_in_m3: 0.661, volume_out_m3: 0.641, reading_count: 39600, peak_pressure_psi: 15.9, peak_flow_in_m3h: 0.0063, peak_flow_out_m3h: 0.0061 },
  { date: "2026-04-14", volume_in_m3: 0.675, volume_out_m3: 0.655, reading_count: 40100, peak_pressure_psi: 16.1, peak_flow_in_m3h: 0.0065, peak_flow_out_m3h: 0.0063 },
];

const totalIn  = days.reduce((s, d) => s + d.volume_in_m3, 0);
const totalOut = days.reduce((s, d) => s + d.volume_out_m3, 0);
console.log(`Seeding ${days.length} days to ${SERVER_URL}/api/seed  (clear=true)`);
console.log(`  Total inlet : ${totalIn.toFixed(3)} m³  (${(totalIn * 1000).toFixed(0)} L)`);
console.log(`  Total outlet: ${totalOut.toFixed(3)} m³  (${((totalOut / totalIn) * 100).toFixed(1)}% of inlet)`);
console.log(`  Est. cost @ ₱28.50/m³: ₱${(totalIn * 28.5).toFixed(2)}`);

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
