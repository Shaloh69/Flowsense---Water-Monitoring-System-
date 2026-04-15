import mysql from "mysql2/promise";

// ── Connection pool ───────────────────────────────────────────────────────────
// Set env vars on Render:
//   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
// Aiven requires SSL — set MYSQL_SSL=false only for local dev without SSL.

export const pool = mysql.createPool({
  host:     process.env.MYSQL_HOST     ?? "localhost",
  port:     parseInt(process.env.MYSQL_PORT ?? "3306"),
  user:     process.env.MYSQL_USER     ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "flowsense",
  ssl:      process.env.MYSQL_SSL === "false" ? undefined : { rejectUnauthorized: true },
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 0,
});

// ── Create tables on first run ────────────────────────────────────────────────

export async function initDb(): Promise<void> {
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

  console.log("DB tables ready");
}
