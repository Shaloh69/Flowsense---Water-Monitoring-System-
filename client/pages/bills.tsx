import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Chip } from "@heroui/chip";

import Layout from "@/components/Layout";
import { useSSE } from "@/lib/useSSE";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";
const PRICE_KEY  = "flowshish_price_per_m3";
const DEFAULT_PRICE = 28.5;

interface Bill {
  id: number;
  billing_period: string;   // "YYYY-MM"
  volume_in_m3: number;
  volume_out_m3: number;
  price_per_m3: number;
  total_cost: number;
  generated_at: string;
  notes: string | null;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconBill = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconPlus = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);
const IconTrash = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const IconRefresh = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPeso(v: number) {
  return "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPeriod(period: string) {
  const [y, m] = period.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Generate Form ─────────────────────────────────────────────────────────────
function GenerateForm({
  periods,
  onClose,
  onGenerated,
}: {
  periods: string[];
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [period, setPeriod]       = useState(periods[0] ?? "");
  const [price, setPrice]         = useState<string>(
    () => localStorage.getItem(PRICE_KEY) ?? String(DEFAULT_PRICE),
  );
  const [notes, setNotes]         = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedPrice = parseFloat(price);
    if (!period) { setError("Select a billing period."); return; }
    if (isNaN(parsedPrice) || parsedPrice <= 0) { setError("Enter a valid price."); return; }

    setLoading(true);
    setError("");

    try {
      const r = await fetch(`${SERVER_URL}/api/bills/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, price_per_m3: parsedPrice, notes: notes || undefined }),
      });
      if (!r.ok) {
        const body = await r.json();
        throw new Error(body.error ?? "Server error");
      }
      localStorage.setItem(PRICE_KEY, String(parsedPrice));
      onGenerated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-300">
            <IconBill />
            <p className="font-semibold text-white">Generate Bill</p>
          </div>
          <button onClick={onClose} className="text-blue-300/50 hover:text-white transition-colors text-lg leading-none">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Period */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
              Billing Period
            </label>
            {periods.length === 0 ? (
              <p className="text-xs text-orange-400/80">
                No data available yet. Send readings from the ESP32 first.
              </p>
            ) : (
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-blue-900/30 border border-blue-700/30 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60 transition-colors"
              >
                {periods.map((p) => (
                  <option key={p} value={p} className="bg-[#0f172a]">
                    {fmtPeriod(p)} ({p})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Price */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
              Price per m³
            </label>
            <div className="flex items-center bg-blue-900/30 border border-blue-700/30 rounded-lg px-3 py-2 gap-2 focus-within:border-blue-500/60 transition-colors">
              <span className="text-blue-200/60 text-sm shrink-0">₱</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="flex-1 bg-transparent text-white font-mono text-sm outline-none min-w-0"
                placeholder="28.50"
              />
              <span className="text-blue-200/40 text-xs shrink-0">/m³</span>
            </div>
            <p className="text-[10px] text-blue-200/30">
              Manila Water ₱61.04 · Maynilad ₱65.62 · Default ₱28.50 (basic)
            </p>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
              Notes <span className="text-blue-300/30 normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Rate increased this month"
              className="bg-blue-900/30 border border-blue-700/30 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500/60 transition-colors resize-none placeholder-blue-400/30"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-sm text-blue-300/60 hover:text-blue-200 border border-blue-700/30 hover:border-blue-600/50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || periods.length === 0}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Spinner size="sm" color="white" /> : <IconBill />}
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BillsPage() {
  useSSE();

  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: bills, isLoading: loadingBills } = useQuery<Bill[]>({
    queryKey: ["bills"],
    queryFn: () => fetch(`${SERVER_URL}/api/bills`).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: periods, isLoading: loadingPeriods } = useQuery<string[]>({
    queryKey: ["bill-periods"],
    queryFn: () => fetch(`${SERVER_URL}/api/bills/periods`).then((r) => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${SERVER_URL}/api/bills/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bills"] }),
  });

  function handleGenerated() {
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ["bills"] });
    queryClient.invalidateQueries({ queryKey: ["bill-periods"] });
  }

  // Summary stats
  const totalBilled  = bills?.reduce((s, b) => s + b.total_cost, 0) ?? 0;
  const totalVolume  = bills?.reduce((s, b) => s + b.volume_in_m3, 0) ?? 0;
  const latestBill   = bills?.[0];

  return (
    <Layout title="Bills — Flowsense" description="Monthly water bills and billing history">
      {showForm && (
        <GenerateForm
          periods={periods ?? []}
          onClose={() => setShowForm(false)}
          onGenerated={handleGenerated}
        />
      )}

      <div className="flex flex-col gap-8">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Water Bills</h1>
            <p className="text-sm text-blue-200/50 mt-1">
              Monthly billing history — generated from daily consumption data
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-900/30 self-start sm:self-auto"
          >
            <IconPlus />
            Generate Bill
          </button>
        </div>

        {/* ── Summary cards ───────────────────────────────────────────────── */}
        {bills && bills.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-4 flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
                Total Billed
              </p>
              <p className="text-2xl font-bold font-mono text-yellow-300">
                {fmtPeso(totalBilled)}
              </p>
              <p className="text-xs text-blue-200/40">across {bills.length} bill{bills.length !== 1 ? "s" : ""}</p>
            </div>

            <div className="glass-card p-4 flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
                Total Volume
              </p>
              <p className="text-2xl font-bold font-mono text-blue-300">
                {totalVolume.toFixed(3)} m³
              </p>
              <p className="text-xs text-blue-200/40">{(totalVolume * 1000).toFixed(0)} liters total</p>
            </div>

            <div className="glass-card p-4 flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
                Latest Bill
              </p>
              <p className="text-2xl font-bold font-mono text-emerald-300">
                {latestBill ? fmtPeso(latestBill.total_cost) : "—"}
              </p>
              <p className="text-xs text-blue-200/40">
                {latestBill ? fmtPeriod(latestBill.billing_period) : "No bills yet"}
              </p>
            </div>
          </div>
        )}

        <Divider className="bg-blue-900/30" />

        {/* ── Bills list ──────────────────────────────────────────────────── */}
        {loadingBills || loadingPeriods ? (
          <div className="flex items-center justify-center py-24 gap-3">
            <Spinner size="md" color="primary" />
            <span className="text-blue-200/50 text-sm">Loading bills…</span>
          </div>
        ) : !bills || bills.length === 0 ? (
          <div className="glass-card p-10 text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-900/40 flex items-center justify-center text-blue-400">
              <IconBill />
            </div>
            <div>
              <p className="text-white font-medium">No bills generated yet</p>
              <p className="text-blue-200/40 text-sm mt-1">
                Click <strong className="text-blue-300">Generate Bill</strong> to create your first monthly bill.
              </p>
            </div>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-900/30">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300/50">
                Billing History
              </p>
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-blue-900/20">
                    {["Period", "Inlet (m³)", "Outlet (m³)", "Price/m³", "Total Cost", "Generated", ""].map((h) => (
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
                  {bills.map((bill, idx) => (
                    <tr
                      key={bill.id}
                      className={`border-b border-blue-900/10 hover:bg-blue-500/10 transition-colors ${idx === 0 ? "bg-blue-500/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-white text-xs">{fmtPeriod(bill.billing_period)}</span>
                          <span className="text-[10px] text-blue-200/40 font-mono">{bill.billing_period}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-blue-300 text-xs">
                        {bill.volume_in_m3.toFixed(3)}
                        <span className="block text-[10px] text-blue-200/30">
                          {(bill.volume_in_m3 * 1000).toFixed(0)} L
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-300/80 text-xs">
                        {bill.volume_out_m3.toFixed(3)}
                      </td>
                      <td className="px-4 py-3 font-mono text-blue-200/60 text-xs">
                        ₱{bill.price_per_m3.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-yellow-300 text-sm">
                          {fmtPeso(bill.total_cost)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[10px] text-blue-200/40">
                        {fmtDate(bill.generated_at)}
                        {bill.notes && (
                          <span className="block text-blue-300/50 mt-0.5 italic">{bill.notes}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* Re-generate */}
                          <button
                            onClick={() => setShowForm(true)}
                            title="Regenerate this bill"
                            className="p-1.5 rounded-lg text-blue-400/60 hover:text-blue-300 hover:bg-blue-600/20 transition-all"
                          >
                            <IconRefresh />
                          </button>
                          {/* Delete */}
                          <button
                            onClick={() => {
                              if (confirm(`Delete bill for ${fmtPeriod(bill.billing_period)}?`)) {
                                deleteMutation.mutate(bill.id);
                              }
                            }}
                            title="Delete bill"
                            className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-600/20 transition-all"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden flex flex-col divide-y divide-blue-900/20">
              {bills.map((bill) => (
                <div key={bill.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white text-sm">{fmtPeriod(bill.billing_period)}</p>
                      <p className="text-[10px] text-blue-200/40 font-mono">{bill.billing_period}</p>
                    </div>
                    <Chip size="sm" variant="flat" color="warning" className="font-mono font-bold">
                      {fmtPeso(bill.total_cost)}
                    </Chip>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-blue-200/40 text-[10px]">Inlet</p>
                      <p className="font-mono text-blue-300">{bill.volume_in_m3.toFixed(3)} m³</p>
                    </div>
                    <div>
                      <p className="text-blue-200/40 text-[10px]">Rate</p>
                      <p className="font-mono text-blue-200/60">₱{bill.price_per_m3.toFixed(2)}/m³</p>
                    </div>
                  </div>
                  {bill.notes && (
                    <p className="text-[10px] text-blue-300/50 italic">{bill.notes}</p>
                  )}
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-blue-200/30">{fmtDate(bill.generated_at)}</p>
                    <button
                      onClick={() => {
                        if (confirm(`Delete bill for ${fmtPeriod(bill.billing_period)}?`)) {
                          deleteMutation.mutate(bill.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-600/20 transition-all"
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Info box ────────────────────────────────────────────────────── */}
        <div className="glass-card p-4 flex items-start gap-3">
          <svg className="w-4 h-4 text-blue-400/60 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-xs text-blue-200/40 flex flex-col gap-1">
            <p>
              Bills are calculated from the <strong className="text-blue-300/60">inlet volume</strong> for
              that month — water that entered your household.
            </p>
            <p>
              Generating a bill for a period that already has one will <strong className="text-blue-300/60">recalculate</strong> it
              with the latest data and the price you enter.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
