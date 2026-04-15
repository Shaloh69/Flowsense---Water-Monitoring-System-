-- Flowsense MySQL schema
-- Run once on your Aiven MySQL instance, or let the server auto-create via initDb().
-- Aiven dashboard → Service overview → Quick connect → copy the connection string.

CREATE TABLE IF NOT EXISTS daily_summaries (
  `date`            DATE   NOT NULL,
  volume_in_m3      DOUBLE NOT NULL DEFAULT 0,
  volume_out_m3     DOUBLE NOT NULL DEFAULT 0,
  reading_count     INT    NOT NULL DEFAULT 0,
  peak_pressure_psi DOUBLE NOT NULL DEFAULT 0,
  peak_flow_in_m3h  DOUBLE NOT NULL DEFAULT 0,
  peak_flow_out_m3h DOUBLE NOT NULL DEFAULT 0,
  PRIMARY KEY (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bills (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  billing_period CHAR(7)  NOT NULL,          -- "YYYY-MM"
  volume_in_m3   DOUBLE   NOT NULL,
  volume_out_m3  DOUBLE   NOT NULL,
  price_per_m3   DOUBLE   NOT NULL,
  total_cost     DOUBLE   NOT NULL,
  generated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes          TEXT,
  UNIQUE KEY uk_period (billing_period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
