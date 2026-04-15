import express, { Request, Response } from "express";
import cors from "cors";

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
  date: string;              // YYYY-MM-DD
  volume_in_m3: number;      // total consumed that day
  volume_out_m3: number;     // total discharged that day
  reading_count: number;
  peak_pressure_psi: number;
  peak_flow_in_m3h: number;
  peak_flow_out_m3h: number;
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ── In-memory store (last 500 readings) ──────────────────────────────────────

const MAX_RECORDS = 500;
const readings: SensorReading[] = [];

// ── Daily summaries (up to 31 days) ──────────────────────────────────────────

const MAX_DAILY_DAYS = 31;
const dailySummaries = new Map<string, DailySummary>();

// Track previous reading to compute per-interval volume delta
let _lastVolIn = 0;
let _lastVolOut = 0;
let _lastDate = "";

function getDateStr(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10); // "YYYY-MM-DD"
}

function accumulateDaily(record: SensorReading): void {
  const date = getDateStr(record.timestamp);
  const isNewDay = date !== _lastDate;

  // On day rollover: reset baseline — the first reading of the new day
  // sets the baseline so we don't carry over yesterday's leftover delta.
  if (isNewDay) {
    _lastVolIn = record.volume_in_m3;
    _lastVolOut = record.volume_out_m3;
    _lastDate = date;
    // Ensure a summary row exists for this date with zero volumes
    if (!dailySummaries.has(date)) {
      dailySummaries.set(date, {
        date,
        volume_in_m3: 0,
        volume_out_m3: 0,
        reading_count: 1,
        peak_pressure_psi: record.pressure_psi,
        peak_flow_in_m3h: record.flow_in_m3h,
        peak_flow_out_m3h: record.flow_out_m3h,
      });
    }
    // Evict oldest day if over limit
    if (dailySummaries.size > MAX_DAILY_DAYS) {
      const oldest = [...dailySummaries.keys()].sort()[0];
      dailySummaries.delete(oldest);
    }
    return;
  }

  // Same day: compute positive delta (guards against sensor reboot causing reset)
  const deltaIn = Math.max(0, record.volume_in_m3 - _lastVolIn);
  const deltaOut = Math.max(0, record.volume_out_m3 - _lastVolOut);
  _lastVolIn = record.volume_in_m3;
  _lastVolOut = record.volume_out_m3;

  const existing = dailySummaries.get(date) ?? {
    date,
    volume_in_m3: 0,
    volume_out_m3: 0,
    reading_count: 0,
    peak_pressure_psi: 0,
    peak_flow_in_m3h: 0,
    peak_flow_out_m3h: 0,
  };

  existing.volume_in_m3 += deltaIn;
  existing.volume_out_m3 += deltaOut;
  existing.reading_count += 1;
  existing.peak_pressure_psi = Math.max(existing.peak_pressure_psi, record.pressure_psi);
  existing.peak_flow_in_m3h = Math.max(existing.peak_flow_in_m3h, record.flow_in_m3h);
  existing.peak_flow_out_m3h = Math.max(existing.peak_flow_out_m3h, record.flow_out_m3h);
  dailySummaries.set(date, existing);
}

// ── SSE client registry — one entry per open browser tab ─────────────────────

const sseClients = new Set<Response>();

function broadcast(record: SensorReading): void {
  const msg = `data: ${JSON.stringify(record)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

// ── GET /api/stream — browser subscribes here for real-time push ──────────────

app.get("/api/stream", (req: Request, res: Response) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable Nginx buffering on Render
  });
  res.flushHeaders();

  // Send the last known reading immediately so the page isn't blank on load
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
// Expected JSON body:
// {
//   "flow_in_m3h":  0.0,
//   "flow_out_m3h": 0.0,
//   "volume_in_m3": 0.0,
//   "volume_out_m3":0.0,
//   "pressure_psi": 0.0
// }

app.post("/api/data", (req: Request, res: Response) => {
  const { flow_in_m3h, flow_out_m3h, volume_in_m3, volume_out_m3, pressure_psi } =
    req.body as Partial<SensorReading>;

  if (
    flow_in_m3h === undefined ||
    flow_out_m3h === undefined ||
    volume_in_m3 === undefined ||
    volume_out_m3 === undefined ||
    pressure_psi === undefined
  ) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const record: SensorReading = {
    timestamp: new Date().toISOString(),
    flow_in_m3h: parseFloat(String(flow_in_m3h)),
    flow_out_m3h: parseFloat(String(flow_out_m3h)),
    volume_in_m3: parseFloat(String(volume_in_m3)),
    volume_out_m3: parseFloat(String(volume_out_m3)),
    pressure_psi: parseFloat(String(pressure_psi)),
  };

  readings.push(record);
  if (readings.length > MAX_RECORDS) readings.shift();

  accumulateDaily(record);
  broadcast(record); // push to all open browser tabs instantly

  console.log(
    `[${record.timestamp}] IN:${record.flow_in_m3h} OUT:${record.flow_out_m3h} PSI:${record.pressure_psi}`,
  );
  res.json({ ok: true, stored: readings.length });
});

// ── GET /api/data/latest — single most recent reading ────────────────────────

app.get("/api/data/latest", (_req: Request, res: Response) => {
  if (readings.length === 0) {
    res.json(null);
    return;
  }
  res.json(readings[readings.length - 1]);
});

// ── GET /api/data — last N readings for chart history ────────────────────────

app.get("/api/data", (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), MAX_RECORDS);
  res.json(readings.slice(-limit));
});

// ── GET /api/reports/weekly — last 7 days daily summaries ────────────────────

app.get("/api/reports/weekly", (_req: Request, res: Response) => {
  const result = buildReport(7);
  res.json(result);
});

// ── GET /api/reports/monthly — last 30 days daily summaries ──────────────────

app.get("/api/reports/monthly", (_req: Request, res: Response) => {
  const result = buildReport(30);
  res.json(result);
});

function buildReport(days: number): DailySummary[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const result: DailySummary[] = [];
  for (const [date, summary] of dailySummaries) {
    if (date >= cutoffStr) result.push(summary);
  }
  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

// ── GET /api/status — health check ───────────────────────────────────────────

app.get("/api/status", (_req: Request, res: Response) => {
  res.json({ status: "ok", records: readings.length, uptime: process.uptime() });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Flowsense server running on port ${PORT}`);
});
