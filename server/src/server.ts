import express, { Request, Response } from "express";
import cors from "cors";
import { RowDataPacket } from "mysql2";
import { pool, initDb } from "./db";

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SensorReading {
  timestamp: string;
  flow_in_m3h: number;
  flow_out_m3h: number;
  volume_in_m3: number;
  volume_out_m3: number;
  pressure_psi: number;
}

interface DailySummary {
  date: string;
  volume_in_m3: number;
  volume_out_m3: number;
  reading_count: number;
  peak_pressure_psi: number;
  peak_flow_in_m3h: number;
  peak_flow_out_m3h: number;
}

interface Bill {
  id: number;
  billing_period: string;
  volume_in_m3: number;
  volume_out_m3: number;
  price_per_m3: number;
  total_cost: number;
  generated_at: string;
  notes: string | null;
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Request logger — logs every incoming HTTP request with method, path, status, time
app.use((req, res, next) => {
  const start = Date.now();
  const { method, path: p, ip } = req;
  res.on("finish", () => {
    const ms   = Date.now() - start;
    const code = res.statusCode;
    const tag  = code >= 400 ? "[ERR]" : "[REQ]";
    // Skip noisy SSE keep-alive pings after connection is established
    if (p === "/api/stream" && code === 200) return;
    console.log(`${tag} ${method} ${p} → ${code}  (${ms} ms)  from ${ip}`);
  });
  next();
});

// ── In-memory store — last 500 live readings for dashboard + SSE ──────────────
// Daily summaries and bills are persisted in MySQL.

const MAX_RECORDS = 500;
const readings: SensorReading[] = [];

// ── Daily accumulation state (resets on server restart — intentional) ─────────
// On restart _lastDate="" so the first ESP reading establishes a fresh baseline.
// Volumes already accumulated today remain in the DB from the previous run.

let _lastVolIn   = 0;
let _lastVolOut  = 0;
let _lastDate    = "";

function getDateStr(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10); // "YYYY-MM-DD"
}

async function accumulateDaily(record: SensorReading): Promise<void> {
  const date     = getDateStr(record.timestamp);
  const isNewDay = date !== _lastDate;

  if (isNewDay) {
    // First reading of a new day (or first after restart) — set baseline only.
    // INSERT IGNORE so we don't clobber an existing row from this session.
    _lastVolIn  = record.volume_in_m3;
    _lastVolOut = record.volume_out_m3;
    _lastDate   = date;

    await pool.execute(
      `INSERT IGNORE INTO daily_summaries
         (\`date\`, reading_count, peak_pressure_psi, peak_flow_in_m3h, peak_flow_out_m3h)
       VALUES (?, 1, ?, ?, ?)`,
      [date, record.pressure_psi, record.flow_in_m3h, record.flow_out_m3h],
    );
    return;
  }

  // Same day — compute positive volume delta (guards against ESP reboot reset)
  const deltaIn  = Math.max(0, record.volume_in_m3  - _lastVolIn);
  const deltaOut = Math.max(0, record.volume_out_m3 - _lastVolOut);
  _lastVolIn  = record.volume_in_m3;
  _lastVolOut = record.volume_out_m3;

  await pool.execute(
    `INSERT INTO daily_summaries
       (\`date\`, volume_in_m3, volume_out_m3, reading_count,
        peak_pressure_psi, peak_flow_in_m3h, peak_flow_out_m3h)
     VALUES (?, ?, ?, 1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       volume_in_m3      = volume_in_m3      + VALUES(volume_in_m3),
       volume_out_m3     = volume_out_m3     + VALUES(volume_out_m3),
       reading_count     = reading_count     + 1,
       peak_pressure_psi = GREATEST(peak_pressure_psi, VALUES(peak_pressure_psi)),
       peak_flow_in_m3h  = GREATEST(peak_flow_in_m3h,  VALUES(peak_flow_in_m3h)),
       peak_flow_out_m3h = GREATEST(peak_flow_out_m3h, VALUES(peak_flow_out_m3h))`,
    [date, deltaIn, deltaOut, record.pressure_psi, record.flow_in_m3h, record.flow_out_m3h],
  );
}

// ── SSE client registry ───────────────────────────────────────────────────────

const sseClients = new Set<Response>();

function broadcast(record: SensorReading): void {
  const msg = `data: ${JSON.stringify(record)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

// ── GET /api/stream — browser subscribes for real-time push ──────────────────

app.get("/api/stream", (req: Request, res: Response) => {
  res.set({
    "Content-Type":    "text/event-stream",
    "Cache-Control":   "no-cache",
    "Connection":      "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  if (readings.length > 0) {
    res.write(`data: ${JSON.stringify(readings[readings.length - 1])}\n\n`);
  }

  sseClients.add(res);
  console.log(`SSE client connected  (total: ${sseClients.size})`);

  req.on("close", () => {
    sseClients.delete(res);
    console.log(`SSE client disconnected (total: ${sseClients.size})`);
  });
});

// ── POST /api/data — ESP32 pushes sensor data here ───────────────────────────

app.post("/api/data", async (req: Request, res: Response) => {
  const { flow_in_m3h, flow_out_m3h, volume_in_m3, volume_out_m3, pressure_psi } =
    req.body as Partial<SensorReading>;

  if (
    flow_in_m3h   === undefined ||
    flow_out_m3h  === undefined ||
    volume_in_m3  === undefined ||
    volume_out_m3 === undefined ||
    pressure_psi  === undefined
  ) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const record: SensorReading = {
    timestamp:    new Date().toISOString(),
    flow_in_m3h:  parseFloat(String(flow_in_m3h)),
    flow_out_m3h: parseFloat(String(flow_out_m3h)),
    volume_in_m3: parseFloat(String(volume_in_m3)),
    volume_out_m3:parseFloat(String(volume_out_m3)),
    pressure_psi: parseFloat(String(pressure_psi)),
  };

  readings.push(record);
  if (readings.length > MAX_RECORDS) readings.shift();

  try {
    await accumulateDaily(record);
  } catch (err) {
    console.error("DB write failed:", err);
  }

  broadcast(record);

  console.log(
    `[ESP32] ${record.timestamp}` +
    ` | IN: ${record.flow_in_m3h.toFixed(6)} m³/min` +
    ` | OUT: ${record.flow_out_m3h.toFixed(6)} m³/min` +
    ` | VolIN: ${record.volume_in_m3.toFixed(5)} m³` +
    ` | VolOUT: ${record.volume_out_m3.toFixed(5)} m³` +
    ` | Pressure: ${record.pressure_psi.toFixed(2)} PSI` +
    ` | clients: ${sseClients.size}`,
  );

  res.json({ ok: true, stored: readings.length });
});

// ── GET /api/data/latest ──────────────────────────────────────────────────────

app.get("/api/data/latest", (_req: Request, res: Response) => {
  res.json(readings.length > 0 ? readings[readings.length - 1] : null);
});

// ── GET /api/data — last N readings for chart ─────────────────────────────────

app.get("/api/data", (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), MAX_RECORDS);
  res.json(readings.slice(-limit));
});

// ── Reports ───────────────────────────────────────────────────────────────────

// Returns the date string (YYYY-MM-DD) of the most recent Monday (today if Monday).
function getMostRecentMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const offset = day === 0 ? 6 : day - 1; // days since last Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - offset);
  return monday.toISOString().slice(0, 10);
}

// Returns the first day of the current calendar month (YYYY-MM-01).
function getFirstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

async function buildReport(cutoffStr: string): Promise<DailySummary[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT \`date\`, volume_in_m3, volume_out_m3, reading_count,
            peak_pressure_psi, peak_flow_in_m3h, peak_flow_out_m3h
     FROM daily_summaries
     WHERE \`date\` >= ?
     ORDER BY \`date\` ASC`,
    [cutoffStr],
  );

  return (rows as RowDataPacket[]).map((r) => ({
    date:              String(r.date).slice(0, 10),
    volume_in_m3:      Number(r.volume_in_m3),
    volume_out_m3:     Number(r.volume_out_m3),
    reading_count:     Number(r.reading_count),
    peak_pressure_psi: Number(r.peak_pressure_psi),
    peak_flow_in_m3h:  Number(r.peak_flow_in_m3h),
    peak_flow_out_m3h: Number(r.peak_flow_out_m3h),
  }));
}

// Weekly: from the most recent Monday to today
app.get("/api/reports/weekly", async (_req: Request, res: Response) => {
  try {
    res.json(await buildReport(getMostRecentMonday()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Monthly: from the 1st of the current month to today
app.get("/api/reports/monthly", async (_req: Request, res: Response) => {
  try {
    res.json(await buildReport(getFirstOfMonth()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// ── Tiered billing ────────────────────────────────────────────────────────────
// Philippine water district rate structure:
//   0 – 10 m³ : ₱259.16  (flat minimum charge)
//  11 – 20 m³ : ₱28.64 / m³ above 10
//  21 – 30 m³ : ₱33.71 / m³ above 20
//  > 30 m³    : extends the last tier rate

function tieredCost(m3: number): number {
  if (m3 <= 10) return 259.16;
  if (m3 <= 20) return 259.16 + (m3 - 10) * 28.64;
  if (m3 <= 30) return 259.16 + 10 * 28.64 + (m3 - 20) * 33.71;
  return 259.16 + 10 * 28.64 + 10 * 33.71 + (m3 - 30) * 33.71;
}

function tieredBreakdown(m3: number): string {
  if (m3 <= 10)
    return `0–10 m³ flat: ₱259.16`;
  if (m3 <= 20)
    return `0–10 m³ flat: ₱259.16 + ${(m3 - 10).toFixed(3)} m³ × ₱28.64 = ₱${((m3 - 10) * 28.64).toFixed(2)}`;
  return (
    `0–10 m³ flat: ₱259.16 + ` +
    `10 m³ × ₱28.64 = ₱${(10 * 28.64).toFixed(2)} + ` +
    `${(m3 - 20).toFixed(3)} m³ × ₱33.71 = ₱${((m3 - 20) * 33.71).toFixed(2)}`
  );
}

// ── Bills ─────────────────────────────────────────────────────────────────────

// GET /api/bills — all bills, newest first
app.get("/api/bills", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, billing_period, volume_in_m3, volume_out_m3,
              price_per_m3, total_cost, generated_at, notes
       FROM bills ORDER BY billing_period DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/bills/periods — months that have daily_summaries data (for dropdown)
app.get("/api/bills/periods", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT DATE_FORMAT(\`date\`, '%Y-%m') AS period
       FROM daily_summaries
       ORDER BY period DESC`,
    );
    res.json(rows.map((r) => String(r.period)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// POST /api/bills/generate — generate (or regenerate) a monthly bill
// Body: { period: "YYYY-MM", price_per_m3?: number, notes?: string }
// If price_per_m3 is omitted, tiered billing is applied automatically.
app.post("/api/bills/generate", async (req: Request, res: Response) => {
  const { period, price_per_m3, notes } = req.body as {
    period: string;
    price_per_m3?: number;
    notes?: string;
  };

  if (!period) {
    res.status(400).json({ error: "period is required" });
    return;
  }

  if (!/^\d{4}-\d{2}$/.test(period)) {
    res.status(400).json({ error: "period must be YYYY-MM" });
    return;
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(volume_in_m3), 0)  AS total_in,
              COALESCE(SUM(volume_out_m3), 0) AS total_out
       FROM daily_summaries
       WHERE DATE_FORMAT(\`date\`, '%Y-%m') = ?`,
      [period],
    );

    const totalIn  = Number(rows[0].total_in);
    const totalOut = Number(rows[0].total_out);

    // Use custom flat rate if provided, otherwise apply tiered structure
    const totalCost    = price_per_m3 != null ? totalIn * Number(price_per_m3) : tieredCost(totalIn);
    const effectiveRate = totalIn > 0 ? totalCost / totalIn : 0;
    const autoNotes    = price_per_m3 != null
      ? (notes ?? null)
      : `${tieredBreakdown(totalIn)}; total: ₱${totalCost.toFixed(2)}${notes ? " | " + notes : ""}`;

    await pool.execute(
      `INSERT INTO bills
         (billing_period, volume_in_m3, volume_out_m3, price_per_m3, total_cost, generated_at, notes)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         volume_in_m3  = VALUES(volume_in_m3),
         volume_out_m3 = VALUES(volume_out_m3),
         price_per_m3  = VALUES(price_per_m3),
         total_cost    = VALUES(total_cost),
         generated_at  = NOW(),
         notes         = VALUES(notes)`,
      [period, totalIn, totalOut, effectiveRate, totalCost, autoNotes],
    );

    const [bill] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM bills WHERE billing_period = ?`,
      [period],
    );

    console.log(`[BILL] Generated ${period}: ₱${totalCost.toFixed(2)} (${totalIn.toFixed(4)} m³, effective ₱${effectiveRate.toFixed(4)}/m³)`);
    res.json(bill[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// DELETE /api/bills/:id
app.delete("/api/bills/:id", async (req: Request, res: Response) => {
  try {
    await pool.execute(`DELETE FROM bills WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// ── POST /api/seed — bulk-load daily summaries (for test data) ────────────────

app.post("/api/seed", async (req: Request, res: Response) => {
  const { days, clear } = req.body as { days: DailySummary[]; clear?: boolean };

  if (!Array.isArray(days) || days.length === 0) {
    res.status(400).json({ error: "days must be a non-empty array" });
    return;
  }

  try {
    if (clear) {
      await pool.execute("DELETE FROM daily_summaries");
      console.log("[SEED] Cleared daily_summaries");
    }

    for (const d of days) {
      await pool.execute(
        `INSERT INTO daily_summaries
           (\`date\`, volume_in_m3, volume_out_m3, reading_count,
            peak_pressure_psi, peak_flow_in_m3h, peak_flow_out_m3h)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           volume_in_m3      = VALUES(volume_in_m3),
           volume_out_m3     = VALUES(volume_out_m3),
           reading_count     = VALUES(reading_count),
           peak_pressure_psi = VALUES(peak_pressure_psi),
           peak_flow_in_m3h  = VALUES(peak_flow_in_m3h),
           peak_flow_out_m3h = VALUES(peak_flow_out_m3h)`,
        [
          d.date,
          d.volume_in_m3,
          d.volume_out_m3,
          d.reading_count,
          d.peak_pressure_psi,
          d.peak_flow_in_m3h,
          d.peak_flow_out_m3h,
        ],
      );
    }
    console.log(`[SEED] Loaded ${days.length} days`);
    res.json({ ok: true, seeded: days.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// ── GET /api/status ───────────────────────────────────────────────────────────

app.get("/api/status", (_req: Request, res: Response) => {
  res.json({ status: "ok", records: readings.length, uptime: process.uptime() });
});

// ── Start — wait for DB init before accepting requests ────────────────────────

async function main() {
  try {
    await initDb();
  } catch (err) {
    console.error("DB init failed — check MYSQL_* env vars:", err);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log("─────────────────────────────────────────");
    console.log(`Flowsense server  →  port ${PORT}`);
    console.log(`DB host           →  ${process.env.MYSQL_HOST ?? "localhost"}`);
    console.log(`DB name           →  ${process.env.MYSQL_DATABASE ?? "flowsense"}`);
    console.log(`Endpoints ready:`);
    console.log(`  POST /api/data          ← ESP32 sends here`);
    console.log(`  GET  /api/stream        ← browser SSE`);
    console.log(`  GET  /api/reports/weekly|monthly`);
    console.log(`  GET  /api/bills         POST /api/bills/generate`);
    console.log("─────────────────────────────────────────");
  });
}

main();
