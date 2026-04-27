import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, Tab } from "@heroui/tabs";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";

import Layout from "@/components/Layout";
import BarChart from "@/components/BarChart";
import { useSSE } from "@/lib/useSSE";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";
const PRICE_KEY = "flowshish_price_per_m3";
const DEFAULT_PRICE = 28.5; // ₱/m³ — Philippines basic residential rate

interface DailySummary {
  date: string;
  volume_in_m3: number;
  volume_out_m3: number;
  reading_count: number;
  peak_pressure_psi: number;
  peak_flow_in_m3h: number;
  peak_flow_out_m3h: number;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconCalendar = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);
const IconDrop = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 14a7 7 0 11-14 0c0-4.418 5-10 7-10s7 5.582 7 10z"
    />
  </svg>
);
const IconPeso = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
    />
  </svg>
);

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({
  icon,
  label,
  value,
  sub,
  color = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: "blue" | "green" | "orange" | "purple";
}) {
  const colorMap = {
    blue: "text-blue-400",
    green: "text-emerald-400",
    orange: "text-orange-400",
    purple: "text-purple-400",
  };
  return (
    <div className="glass-card p-4 flex flex-col gap-2">
      <div className={`flex items-center gap-2 ${colorMap[color]}`}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-200/50">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold font-mono text-white leading-none">{value}</p>
      {sub && <p className="text-xs text-blue-200/40">{sub}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  useSSE(); // keep SSE alive so Live chip in navbar works

  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");
  const [priceInput, setPriceInput] = useState<string>(String(DEFAULT_PRICE));
  const [price, setPrice] = useState<number>(DEFAULT_PRICE);

  // Persist price to localStorage
  useEffect(() => {
    const stored = localStorage.getItem(PRICE_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed > 0) {
        setPrice(parsed);
        setPriceInput(String(parsed));
      }
    }
  }, []);

  const handlePriceChange = useCallback((val: string) => {
    setPriceInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setPrice(parsed);
      localStorage.setItem(PRICE_KEY, String(parsed));
    }
  }, []);

  const { data: weeklyData, isLoading: loadingWeekly } = useQuery<DailySummary[]>({
    queryKey: ["reports", "weekly"],
    queryFn: () => fetch(`${SERVER_URL}/api/reports/weekly`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const { data: monthlyData, isLoading: loadingMonthly } = useQuery<DailySummary[]>({
    queryKey: ["reports", "monthly"],
    queryFn: () => fetch(`${SERVER_URL}/api/reports/monthly`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const data = tab === "weekly" ? weeklyData : monthlyData;
  const isLoading = tab === "weekly" ? loadingWeekly : loadingMonthly;

  // Computed totals
  const totalIn = data?.reduce((s, d) => s + d.volume_in_m3, 0) ?? 0;
  const totalOut = data?.reduce((s, d) => s + d.volume_out_m3, 0) ?? 0;
  const netConsumption = totalIn - totalOut;
  const estimatedCost = totalIn * price;

  const xLabels = data?.map((d) => d.date) ?? [];
  const barSeries = [
    { label: "Inlet (m³)", values: data?.map((d) => d.volume_in_m3) ?? [], color: "#60a5fa" },
    { label: "Outlet (m³)", values: data?.map((d) => d.volume_out_m3) ?? [], color: "#34d399" },
  ];

  const fmt3 = (v: number) => v.toFixed(3);
  const fmtPeso = (v: number) =>
    "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Layout title="Reports — Flowsense" description="Weekly and monthly water usage reports">
      <div className="flex flex-col gap-8">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Usage Reports</h1>
            <p className="text-sm text-blue-200/50 mt-1">
              Daily water consumption breakdown with cost estimation
            </p>
          </div>

          {/* Price input */}
          <div className="flex flex-col gap-1 w-full sm:w-64">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
              Price per m³
            </label>
            <div className="flex items-center bg-blue-900/30 border border-blue-700/30 rounded-lg px-3 py-2 gap-2 focus-within:border-blue-500/60 transition-colors">
              <span className="text-blue-200/60 text-sm shrink-0">₱</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceInput}
                onChange={(e) => handlePriceChange(e.target.value)}
                className="flex-1 bg-transparent text-white font-mono text-sm outline-none placeholder-blue-400/30 min-w-0"
                placeholder="28.50"
              />
              <span className="text-blue-200/40 text-xs shrink-0">/m³</span>
            </div>
            <p className="text-[10px] text-blue-200/30">
              Ref: Manila Water ₱61.04 · Maynilad ₱65.62 · Default ₱28.50 (basic)
            </p>
          </div>
        </div>

        {/* ── Period tabs ─────────────────────────────────────────────────── */}
        <Tabs
          selectedKey={tab}
          onSelectionChange={(k) => setTab(k as "weekly" | "monthly")}
          variant="underlined"
          classNames={{
            tabList: "border-b border-blue-900/30",
            tab: "text-blue-200/60 data-[selected=true]:text-blue-300",
            tabContent: "font-medium",
            cursor: "bg-blue-500",
          }}
        >
          <Tab
            key="weekly"
            title={
              <span className="flex items-center gap-2">
                <IconCalendar />
                Weekly
              </span>
            }
          />
          <Tab
            key="monthly"
            title={
              <span className="flex items-center gap-2">
                <IconCalendar />
                Monthly
              </span>
            }
          />
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 gap-3">
            <Spinner size="md" color="primary" />
            <span className="text-blue-200/50 text-sm">Loading report data…</span>
          </div>
        ) : !data || data.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-blue-200/40 text-sm">
              No data yet for this period. Data accumulates as the ESP32 sends readings.
            </p>
          </div>
        ) : (
          <>
            {/* ── Summary cards ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                icon={<IconDrop />}
                label="Total Inlet"
                value={`${fmt3(totalIn)} m³`}
                sub={`${(totalIn * 1000).toFixed(1)} liters`}
                color="blue"
              />
              <SummaryCard
                icon={<IconDrop />}
                label="Total Outlet"
                value={`${fmt3(totalOut)} m³`}
                sub={`${(totalOut * 1000).toFixed(1)} liters`}
                color="green"
              />
              <SummaryCard
                icon={<IconDrop />}
                label="Net Consumption"
                value={`${fmt3(netConsumption)} m³`}
                sub={netConsumption < 0 ? "Outlet exceeds inlet" : undefined}
                color={netConsumption < 0 ? "orange" : "purple"}
              />
              <SummaryCard
                icon={<IconPeso />}
                label="Est. Water Cost"
                value={fmtPeso(estimatedCost)}
                sub={`@ ₱${price.toFixed(2)}/m³`}
                color="orange"
              />
            </div>

            {/* ── Bar chart ───────────────────────────────────────────────── */}
            <div className="glass-card p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50 mb-4">
                Daily Volume ({tab === "weekly" ? "This Week (Mon – Today)" : "This Month"})
              </p>
              <BarChart series={barSeries} xLabels={xLabels} height={220} unit="m³" />
            </div>

            <Divider className="bg-blue-900/30" />

            {/* ── Daily breakdown table ────────────────────────────────────── */}
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-blue-900/30">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
                  Daily Breakdown
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-blue-900/20">
                      {[
                        "Date",
                        "Inlet (m³)",
                        "Outlet (m³)",
                        "Peak IN (m³/h)",
                        "Peak OUT (m³/h)",
                        "Peak PSI",
                        "Est. Cost",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-blue-200/50 bg-blue-900/20"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data].reverse().map((row, idx) => (
                      <tr
                        key={row.date}
                        className={`border-b border-blue-900/10 hover:bg-blue-500/10 transition-colors ${idx === 0 ? "bg-blue-500/5" : ""}`}
                      >
                        <td className="px-4 py-2.5 font-mono text-blue-100/90 text-xs font-semibold">
                          {row.date}
                          {idx === 0 && (
                            <span className="ml-2 text-[9px] bg-blue-600/40 text-blue-300 px-1.5 py-0.5 rounded">
                              Today
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-blue-300 text-xs">
                          {fmt3(row.volume_in_m3)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-emerald-300 text-xs">
                          {fmt3(row.volume_out_m3)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-blue-200/60 text-xs">
                          {row.peak_flow_in_m3h.toFixed(4)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-blue-200/60 text-xs">
                          {row.peak_flow_out_m3h.toFixed(4)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-orange-300/80 text-xs">
                          {row.peak_pressure_psi.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-yellow-300/80 text-xs">
                          {fmtPeso(row.volume_in_m3 * price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
