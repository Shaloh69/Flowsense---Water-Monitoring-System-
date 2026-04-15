import { useEffect } from "react";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Chip } from "@heroui/chip";
import { useQuery } from "@tanstack/react-query";

import Layout from "@/components/Layout";
import StatCard from "@/components/StatCard";
import LineChart from "@/components/LineChart";
import HistoryTable from "@/components/HistoryTable";
import { useSensorStore } from "@/lib/store/sensor-store";
import { useSSE } from "@/lib/useSSE";
import { toast } from "@/lib/toast";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconDropIn = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 14a7 7 0 11-14 0c0-4.418 5-10 7-10s7 5.582 7 10z"
    />
  </svg>
);
const IconDropOut = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 14a7 7 0 11-14 0c0-4.418 5-10 7-10s7 5.582 7 10zM12 12v4m0 0l-2-2m2 2l2-2"
    />
  </svg>
);
const IconVolume = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 7h16M4 12h16M4 17h10"
    />
  </svg>
);
const IconPressure = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707"
    />
  </svg>
);
const IconActivity = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
);

// ── Trend helper ──────────────────────────────────────────────────────────────
function trend(arr: number[]): "up" | "down" | "stable" {
  if (arr.length < 4) return "stable";
  const last = arr.slice(-4);
  const diff = last[last.length - 1] - last[0];
  if (diff > 0.002) return "up";
  if (diff < -0.002) return "down";
  return "stable";
}

// ── Gauge-style pressure indicator ───────────────────────────────────────────
function PressureGauge({ psi, max = 30 }: { psi: number; max?: number }) {
  const pct = Math.min(Math.max(psi / max, 0), 1);
  const color = pct > 0.85 ? "#f97316" : pct > 0.6 ? "#fbbf24" : "#60a5fa";
  const zones = [
    { label: "Low", range: "0–9", color: "#60a5fa" },
    { label: "Normal", range: "9–22", color: "#34d399" },
    { label: "High", range: "22–30", color: "#f97316" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {/* Bar */}
      <div className="relative">
        <div className="h-3 w-full rounded-full bg-blue-900/40 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct * 100}%`, background: color }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-blue-200/30">0</span>
          <span className="text-[9px] text-blue-200/30">{max} PSI</span>
        </div>
      </div>
      {/* Zone legend */}
      <div className="flex items-center gap-3">
        {zones.map((z) => (
          <div key={z.label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: z.color }} />
            <span className="text-[9px] text-blue-200/30">
              {z.label} ({z.range})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  useSSE();

  const { latest, history, connected } = useSensorStore();
  const { loadHistory } = useSensorStore();

  const { data: initialHistory } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      const r = await fetch(`${SERVER_URL}/api/data?limit=60`);
      return r.json();
    },
  });

  useEffect(() => {
    if (initialHistory?.length) loadHistory(initialHistory);
  }, [initialHistory, loadHistory]);

  // High pressure warning toast
  useEffect(() => {
    if (latest?.pressure_psi && latest.pressure_psi > 25) {
      toast.warning(
        "High Pressure",
        `Line pressure is ${latest.pressure_psi.toFixed(2)} PSI — exceeds 25 PSI.`,
      );
    }
  }, [latest?.pressure_psi]);

  // Extract per-field history arrays
  const finH = history.map((r) => r.flow_in_m3h);
  const foutH = history.map((r) => r.flow_out_m3h);
  const vinH = history.map((r) => r.volume_in_m3);
  const voutH = history.map((r) => r.volume_out_m3);
  const psiH = history.map((r) => r.pressure_psi);
  const timeLabels = history.map((r) =>
    new Date(r.timestamp).toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  );

  const fmt4 = (v?: number) => (v !== undefined ? v.toFixed(4) : "--");
  const fmt2 = (v?: number) => (v !== undefined ? v.toFixed(2) : "--");

  return (
    <Layout>
      {!latest ? (
        /* ── Loading state ──────────────────────────────────────────────── */
        <div className="flex flex-col items-center justify-center gap-4 py-32">
          <Spinner size="lg" color="primary" />
          <p className="text-blue-200/60 text-sm">Waiting for data from Flowsense ESP32…</p>
          <p className="text-blue-200/30 text-xs">
            {connected ? "Connected — no data received yet." : "Not connected to server."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* ── Row 1: 5 KPI metric cards ──────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/40 mb-3">
              Live Readings
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="Inlet Flow"
                value={fmt4(latest.flow_in_m3h)}
                unit="m³/h"
                icon={<IconDropIn />}
                chartData={finH}
                chartColor="#60a5fa"
                trend={trend(finH)}
              />
              <StatCard
                label="Outlet Flow"
                value={fmt4(latest.flow_out_m3h)}
                unit="m³/h"
                icon={<IconDropOut />}
                chartData={foutH}
                chartColor="#34d399"
                trend={trend(foutH)}
              />
              <StatCard
                label="Inlet Volume"
                value={fmt4(latest.volume_in_m3)}
                unit="m³"
                icon={<IconVolume />}
                chartData={vinH}
                chartColor="#818cf8"
                trend={trend(vinH)}
              />
              <StatCard
                label="Outlet Volume"
                value={fmt4(latest.volume_out_m3)}
                unit="m³"
                icon={<IconVolume />}
                chartData={voutH}
                chartColor="#a78bfa"
                trend={trend(voutH)}
              />
              <StatCard
                label="Pressure"
                value={fmt2(latest.pressure_psi)}
                unit="PSI"
                icon={<IconPressure />}
                chartData={psiH}
                chartColor="#fb923c"
                trend={trend(psiH)}
                highlight={latest.pressure_psi > 25}
              />
            </div>
          </section>

          {/* ── Row 2: Flow rate chart (2/3) + Session summary (1/3) ────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Flow rates over time */}
            <div className="lg:col-span-2 glass-card p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
                  Flow Rate — Real-time
                </p>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 rounded bg-blue-400 inline-block" />
                    <span className="text-[10px] text-blue-200/40">Inlet</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 rounded bg-emerald-400 inline-block" />
                    <span className="text-[10px] text-blue-200/40">Outlet</span>
                  </span>
                </div>
              </div>
              <LineChart
                series={[
                  { label: "Inlet", data: finH, color: "#60a5fa" },
                  { label: "Outlet", data: foutH, color: "#34d399" },
                ]}
                xLabels={timeLabels}
                height={200}
                unit="m³/h"
              />
            </div>

            {/* Session summary */}
            <div className="glass-card p-5 flex flex-col justify-between gap-4">
              <div className="flex items-center gap-2 text-blue-300/50">
                <IconActivity />
                <p className="text-[10px] font-semibold uppercase tracking-widest">
                  Session Summary
                </p>
              </div>

              <div className="flex flex-col gap-3 flex-1">
                {[
                  { label: "Readings", val: String(history.length), color: "text-blue-100" },
                  {
                    label: "Peak Flow IN",
                    val: `${Math.max(...finH, 0).toFixed(4)} m³/h`,
                    color: "text-blue-300",
                  },
                  {
                    label: "Peak Flow OUT",
                    val: `${Math.max(...foutH, 0).toFixed(4)} m³/h`,
                    color: "text-emerald-300",
                  },
                  {
                    label: "Peak Pressure",
                    val: `${Math.max(...psiH, 0).toFixed(2)} PSI`,
                    color: "text-orange-300",
                  },
                  {
                    label: "Max Volume IN",
                    val: `${Math.max(...vinH, 0).toFixed(4)} m³`,
                    color: "text-purple-300",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="flex justify-between items-center border-b border-blue-900/20 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-xs text-blue-200/40">{s.label}</span>
                    <span className={`text-xs font-mono font-semibold ${s.color}`}>{s.val}</span>
                  </div>
                ))}
              </div>

              {/* Net flow indicator */}
              <div className="mt-2">
                <p className="text-[10px] text-blue-200/30 mb-1.5">Net Flow (IN − OUT)</p>
                <div className="flex items-center gap-2">
                  <Chip
                    size="sm"
                    variant="flat"
                    color={latest.flow_in_m3h >= latest.flow_out_m3h ? "success" : "warning"}
                  >
                    {(latest.flow_in_m3h - latest.flow_out_m3h).toFixed(4)} m³/h
                  </Chip>
                </div>
              </div>
            </div>
          </section>

          {/* ── Row 3: Volume chart (1/2) + Pressure chart (1/2) ────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Accumulated volume */}
            <div className="glass-card p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
                  Accumulated Volume
                </p>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 rounded bg-indigo-400 inline-block" />
                    <span className="text-[10px] text-blue-200/40">Inlet</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 rounded bg-violet-400 inline-block" />
                    <span className="text-[10px] text-blue-200/40">Outlet</span>
                  </span>
                </div>
              </div>
              <LineChart
                series={[
                  { label: "Inlet Vol", data: vinH, color: "#818cf8" },
                  { label: "Outlet Vol", data: voutH, color: "#a78bfa" },
                ]}
                xLabels={timeLabels}
                height={160}
                unit="m³"
              />
            </div>

            {/* Pressure */}
            <div className="glass-card p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
                  Line Pressure
                </p>
                <Chip
                  size="sm"
                  variant="flat"
                  color={
                    latest.pressure_psi > 25
                      ? "danger"
                      : latest.pressure_psi > 18
                        ? "warning"
                        : "default"
                  }
                  className="text-[10px]"
                >
                  {latest.pressure_psi > 25
                    ? "⚠ High"
                    : latest.pressure_psi > 18
                      ? "Elevated"
                      : "Normal"}
                </Chip>
              </div>
              <LineChart
                series={[{ label: "Pressure", data: psiH, color: "#fb923c" }]}
                xLabels={timeLabels}
                height={120}
                unit="PSI"
              />
              <PressureGauge psi={latest.pressure_psi} />
            </div>
          </section>

          <Divider className="bg-blue-900/30" />

          {/* ── Row 4: Recent readings table ────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/40 mb-3">
              Recent Readings
            </p>
            <HistoryTable data={history} />
          </section>
        </div>
      )}
    </Layout>
  );
}
