import mysql, { RowDataPacket } from "mysql2/promise";

// ── Connection pool ───────────────────────────────────────────────────────────
// Render env vars: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
// Aiven requires SSL. Set MYSQL_SSL=false only for local dev without SSL.

export const pool = mysql.createPool({
  host:     process.env.MYSQL_HOST     ?? "localhost",
  port:     parseInt(process.env.MYSQL_PORT ?? "3306"),
  user:     process.env.MYSQL_USER     ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "flowsense",
  ssl:      process.env.MYSQL_SSL === "false" ? undefined : { rejectUnauthorized: false },
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 0,
});

// ── Auto-migrate: create tables ───────────────────────────────────────────────

async function migrate(): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS daily_summaries (
      \`date\`           DATE   NOT NULL,
      volume_in_m3      DOUBLE NOT NULL DEFAULT 0,
      volume_out_m3     DOUBLE NOT NULL DEFAULT 0,
      reading_count     INT    NOT NULL DEFAULT 0,
      peak_pressure_psi DOUBLE NOT NULL DEFAULT 0,
      peak_flow_in_m3h  DOUBLE NOT NULL DEFAULT 0,
      peak_flow_out_m3h DOUBLE NOT NULL DEFAULT 0,
      PRIMARY KEY (\`date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS bills (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      billing_period CHAR(7)  NOT NULL,
      volume_in_m3   DOUBLE   NOT NULL,
      volume_out_m3  DOUBLE   NOT NULL,
      price_per_m3   DOUBLE   NOT NULL,
      total_cost     DOUBLE   NOT NULL,
      generated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notes          TEXT,
      UNIQUE KEY uk_period (billing_period)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log("[DB] Tables ready");
}

// ── Seed data — 14 days (April 1–14 2026, 4-person Philippine household) ──────
// Context:
//   Apr 1–5  = Holy Week (families home → higher weekend-like usage)
//   Weekdays = ~670 L/day   Weekends/holidays = ~850–960 L/day
//   Peak flow is in m³/min (field name says m3h but ESP sends L/min × 0.001)
//   Outlet ≈ 94 % of inlet (drinking water, evaporation loss)

const SEED_ROWS = [
  // date          vol_in   vol_out  readings  peak_psi  peak_fin  peak_fout
  ["2026-04-01",   0.825,   0.779,   40200,    16.8,     0.0072,   0.0068],  // Holy Wed
  ["2026-04-02",   0.868,   0.820,   41500,    17.1,     0.0075,   0.0071],  // Maundy Thu
  ["2026-04-03",   0.558,   0.527,   38900,    15.4,     0.0054,   0.0051],  // Good Fri (quiet)
  ["2026-04-04",   0.632,   0.597,   39800,    16.0,     0.0061,   0.0058],  // Black Sat
  ["2026-04-05",   0.957,   0.904,   42100,    17.5,     0.0083,   0.0079],  // Easter Sun (guests)
  ["2026-04-06",   0.671,   0.634,   40300,    16.5,     0.0066,   0.0063],  // Mon
  ["2026-04-07",   0.658,   0.621,   39900,    15.8,     0.0064,   0.0061],  // Tue
  ["2026-04-08",   0.681,   0.643,   40700,    16.2,     0.0067,   0.0063],  // Wed
  ["2026-04-09",   0.703,   0.663,   41200,    16.7,     0.0070,   0.0066],  // Thu
  ["2026-04-10",   0.690,   0.652,   40500,    16.4,     0.0068,   0.0064],  // Fri
  ["2026-04-11",   0.914,   0.863,   42800,    17.8,     0.0081,   0.0076],  // Sat (laundry)
  ["2026-04-12",   0.849,   0.802,   41900,    17.2,     0.0075,   0.0071],  // Sun
  ["2026-04-13",   0.661,   0.624,   39600,    15.9,     0.0063,   0.0060],  // Mon
  ["2026-04-14",   0.675,   0.638,   40100,    16.1,     0.0065,   0.0062],  // Tue
] as const;

async function seed(): Promise<void> {
  // Only seed if the table is completely empty
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS cnt FROM daily_summaries",
  );
  const count = Number(rows[0].cnt);

  if (count > 0) {
    console.log(`[DB] daily_summaries has ${count} rows — skipping seed`);
    return;
  }

  console.log(`[DB] Seeding ${SEED_ROWS.length} days of demo data…`);

  for (const [date, vol_in, vol_out, readings, peak_psi, peak_fin, peak_fout] of SEED_ROWS) {
    await pool.execute(
      `INSERT INTO daily_summaries
         (\`date\`, volume_in_m3, volume_out_m3, reading_count,
          peak_pressure_psi, peak_flow_in_m3h, peak_flow_out_m3h)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [date, vol_in, vol_out, readings, peak_psi, peak_fin, peak_fout],
    );
  }

  const totalIn = SEED_ROWS.reduce((s, r) => s + r[1], 0);
  console.log(
    `[DB] Seed complete — ${SEED_ROWS.length} days,` +
    ` ${totalIn.toFixed(3)} m³ total inlet,` +
    ` est. ₱${(totalIn * 28.5).toFixed(2)} @ ₱28.50/m³`,
  );
}

// ── initDb — called once at server startup ────────────────────────────────────

export async function initDb(): Promise<void> {
  await migrate();
  await seed();
}
