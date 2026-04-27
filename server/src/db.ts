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

// ── Seed data — 12 days (April 15–26 2026, 4-person Philippine household) ──────
// Billing period: April 15–26.  Meter: 1442 → 1452 m³  (10 m³ total consumption).
// Weekdays ≈ 0.770–0.820 m³/day, weekends ≈ 0.880–0.940 m³/day.
// Outlet ≈ 97 % of inlet (YF-S201 sensor tolerance, healthy pipe, no leaks).
// Peak pressure cycles: [0.98, 1.89, 2.94, 3.91, 4.83] PSI (matches ESP32 demo).
const SEED_ROWS = [
  // date          vol_in  vol_out  readings  peak_psi  peak_fin  peak_fout
  ["2026-04-15",   0.790,  0.766,   41200,    0.98,     0.0069,   0.0067],  // Wed
  ["2026-04-16",   0.810,  0.786,   41400,    1.89,     0.0070,   0.0068],  // Thu
  ["2026-04-17",   0.780,  0.757,   41100,    2.94,     0.0068,   0.0066],  // Fri
  ["2026-04-18",   0.920,  0.892,   42400,    3.91,     0.0080,   0.0078],  // Sat (laundry)
  ["2026-04-19",   0.900,  0.873,   42200,    4.83,     0.0078,   0.0076],  // Sun
  ["2026-04-20",   0.800,  0.776,   41300,    0.98,     0.0070,   0.0068],  // Mon
  ["2026-04-21",   0.770,  0.747,   41000,    1.89,     0.0067,   0.0065],  // Tue
  ["2026-04-22",   0.790,  0.766,   41200,    2.94,     0.0069,   0.0067],  // Wed
  ["2026-04-23",   0.820,  0.795,   41500,    3.91,     0.0071,   0.0069],  // Thu
  ["2026-04-24",   0.800,  0.776,   41300,    4.83,     0.0070,   0.0068],  // Fri
  ["2026-04-25",   0.940,  0.912,   42600,    0.98,     0.0082,   0.0080],  // Sat (peak)
  ["2026-04-26",   0.880,  0.854,   42000,    1.89,     0.0077,   0.0075],  // Sun
] as const;

async function seed(): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS cnt, COALESCE(MAX(CASE WHEN `date`='2026-04-15' THEN volume_in_m3 END), -1) AS apr15_in FROM daily_summaries",
  );
  const count     = Number(rows[0].cnt);
  const apr15In   = Number(rows[0].apr15_in);
  const isCurrent = Math.abs(apr15In - 0.790) < 0.001;

  if (count > 0 && isCurrent) {
    console.log(`[DB] daily_summaries has ${count} rows and is up to date — skipping seed`);
    return;
  }

  if (count > 0) {
    console.log("[DB] Stale seed data detected — clearing and reseeding…");
    await pool.execute("DELETE FROM daily_summaries");
  } else {
    console.log(`[DB] Seeding ${SEED_ROWS.length} days of demo data…`);
  }

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
  const cost    = totalIn <= 10 ? 259.16 : 259.16 + (totalIn - 10) * 28.64;
  console.log(
    `[DB] Seed complete — ${SEED_ROWS.length} days,` +
    ` ${totalIn.toFixed(3)} m³ total inlet,` +
    ` est. ₱${cost.toFixed(2)} (tiered billing)`,
  );
}

// ── initDb — called once at server startup ────────────────────────────────────

export async function initDb(): Promise<void> {
  await migrate();
  await seed();
}
