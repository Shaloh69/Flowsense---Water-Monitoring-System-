/**
 * Seed script — loads 14 days of realistic data for a 4-person Philippine household.
 *
 * Usage:
 *   npm run seed                                        ← localhost:3000
 *   npm run seed -- https://flowsense-server.onrender.com
 *
 * Context:
 *   April 1–14 2026.  Apr 1–5 = Holy Week (Maundy Thu, Good Fri, Black Sat, Easter).
 *   Family of 4 in a typical Philippine house.
 *   Average weekday: ~680 L.  Weekend / holiday: ~850–960 L.
 *   Pressure normal: 12–18 PSI.  Peak flow ~8 L/min = 0.008 m³/min (field labelled m3h).
 *   Outlet ≈ 94 % of inlet (drinking water loss, evaporation).
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

// ── 14-day dataset ─────────────────────────────────────────────────────────────
// reading_count: ESP posts every 2 s → ~43 200 readings/day if online 24/7.
// Typical: ~38 000–42 000 (some boot/reconnect gaps).

const days: DailySummary[] = [
  // ── Holy Wednesday (family home early, moderate activity) ──────────────────
  {
    date: "2026-04-01",
    volume_in_m3: 0.825, volume_out_m3: 0.779,
    reading_count: 40200,
    peak_pressure_psi: 16.8, peak_flow_in_m3h: 0.0072, peak_flow_out_m3h: 0.0068,
  },
  // ── Maundy Thursday (PH public holiday, family home, mid-day Mass) ─────────
  {
    date: "2026-04-02",
    volume_in_m3: 0.868, volume_out_m3: 0.820,
    reading_count: 41500,
    peak_pressure_psi: 17.1, peak_flow_in_m3h: 0.0075, peak_flow_out_m3h: 0.0071,
  },
  // ── Good Friday (solemn, minimal water use, fasting) ──────────────────────
  {
    date: "2026-04-03",
    volume_in_m3: 0.558, volume_out_m3: 0.527,
    reading_count: 38900,
    peak_pressure_psi: 15.4, peak_flow_in_m3h: 0.0054, peak_flow_out_m3h: 0.0051,
  },
  // ── Black Saturday (quiet, some cleaning before Easter) ───────────────────
  {
    date: "2026-04-04",
    volume_in_m3: 0.632, volume_out_m3: 0.597,
    reading_count: 39800,
    peak_pressure_psi: 16.0, peak_flow_in_m3h: 0.0061, peak_flow_out_m3h: 0.0058,
  },
  // ── Easter Sunday (family noche buena-style lunch, guests) ────────────────
  {
    date: "2026-04-05",
    volume_in_m3: 0.957, volume_out_m3: 0.904,
    reading_count: 42100,
    peak_pressure_psi: 17.5, peak_flow_in_m3h: 0.0083, peak_flow_out_m3h: 0.0079,
  },
  // ── Monday — back to normal, kids at school, parents at work ──────────────
  {
    date: "2026-04-06",
    volume_in_m3: 0.671, volume_out_m3: 0.634,
    reading_count: 40300,
    peak_pressure_psi: 16.5, peak_flow_in_m3h: 0.0066, peak_flow_out_m3h: 0.0063,
  },
  {
    date: "2026-04-07",
    volume_in_m3: 0.658, volume_out_m3: 0.621,
    reading_count: 39900,
    peak_pressure_psi: 15.8, peak_flow_in_m3h: 0.0064, peak_flow_out_m3h: 0.0061,
  },
  {
    date: "2026-04-08",
    volume_in_m3: 0.681, volume_out_m3: 0.643,
    reading_count: 40700,
    peak_pressure_psi: 16.2, peak_flow_in_m3h: 0.0067, peak_flow_out_m3h: 0.0063,
  },
  {
    date: "2026-04-09",
    volume_in_m3: 0.703, volume_out_m3: 0.663,
    reading_count: 41200,
    peak_pressure_psi: 16.7, peak_flow_in_m3h: 0.0070, peak_flow_out_m3h: 0.0066,
  },
  {
    date: "2026-04-10",
    volume_in_m3: 0.690, volume_out_m3: 0.652,
    reading_count: 40500,
    peak_pressure_psi: 16.4, peak_flow_in_m3h: 0.0068, peak_flow_out_m3h: 0.0064,
  },
  // ── Saturday — laundry day, all home, summer heat → more showers ──────────
  {
    date: "2026-04-11",
    volume_in_m3: 0.914, volume_out_m3: 0.863,
    reading_count: 42800,
    peak_pressure_psi: 17.8, peak_flow_in_m3h: 0.0081, peak_flow_out_m3h: 0.0076,
  },
  // ── Sunday ────────────────────────────────────────────────────────────────
  {
    date: "2026-04-12",
    volume_in_m3: 0.849, volume_out_m3: 0.802,
    reading_count: 41900,
    peak_pressure_psi: 17.2, peak_flow_in_m3h: 0.0075, peak_flow_out_m3h: 0.0071,
  },
  {
    date: "2026-04-13",
    volume_in_m3: 0.661, volume_out_m3: 0.624,
    reading_count: 39600,
    peak_pressure_psi: 15.9, peak_flow_in_m3h: 0.0063, peak_flow_out_m3h: 0.0060,
  },
  {
    date: "2026-04-14",
    volume_in_m3: 0.675, volume_out_m3: 0.638,
    reading_count: 40100,
    peak_pressure_psi: 16.1, peak_flow_in_m3h: 0.0065, peak_flow_out_m3h: 0.0062,
  },
];

// ── Compute summary ────────────────────────────────────────────────────────────

const totalIn  = days.reduce((s, d) => s + d.volume_in_m3, 0);
const totalOut = days.reduce((s, d) => s + d.volume_out_m3, 0);
console.log(`Seeding ${days.length} days to ${SERVER_URL}/api/seed`);
console.log(`  Total inlet : ${totalIn.toFixed(3)} m³  (${(totalIn * 1000).toFixed(0)} L)`);
console.log(`  Total outlet: ${totalOut.toFixed(3)} m³`);
console.log(`  Est. cost @ ₱28.50/m³: ₱${(totalIn * 28.5).toFixed(2)}`);

// ── POST to /api/seed ─────────────────────────────────────────────────────────

fetch(`${SERVER_URL}/api/seed`, {
  method:  "POST",
  headers: { "Content-Type": "application/json" },
  body:    JSON.stringify({ days }),
})
  .then(async (r) => {
    const body = await r.json();
    if (r.ok) {
      console.log(`\nDone — server response:`, body);
    } else {
      console.error(`\nServer returned ${r.status}:`, body);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("\nFetch failed:", err.message);
    process.exit(1);
  });
