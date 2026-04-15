"use client";
import { useEffect, useRef } from "react";

export interface BarSeries {
  label: string;
  values: number[];
  color: string;
}

interface Props {
  series: BarSeries[];
  xLabels: string[];
  height?: number;
  unit?: string;
}

export default function BarChart({ series, xLabels, height = 200, unit = "" }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || xLabels.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const PAD_L = 44;
    const PAD_R = 12;
    const PAD_T = 14;
    const PAD_B = 36;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const n = xLabels.length;
    const seriesCount = series.length;
    const allVals = series.flatMap((s) => s.values);
    if (allVals.length === 0) return;
    const maxVal = Math.max(...allVals, 0.001);
    const yMax = maxVal * 1.12;

    const groupW = chartW / n;
    const BAR_GAP = 3;
    const barW = seriesCount > 0 ? Math.max(4, (groupW - BAR_GAP * (seriesCount + 1)) / seriesCount) : 10;

    // Grid
    const ticks = 4;
    ctx.strokeStyle = "rgba(96,165,250,0.08)";
    ctx.lineWidth = 1;
    for (let t = 0; t <= ticks; t++) {
      const y = PAD_T + (t / ticks) * chartH;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(PAD_L + chartW, y);
      ctx.stroke();
    }

    // Y labels
    ctx.fillStyle = "rgba(147,197,253,0.4)";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    for (let t = 0; t <= ticks; t++) {
      const v = yMax - (yMax * t) / ticks;
      const y = PAD_T + (t / ticks) * chartH;
      ctx.fillText(v.toFixed(3), PAD_L - 4, y + 3);
    }

    // Bars
    for (let i = 0; i < n; i++) {
      const groupX = PAD_L + i * groupW;
      const totalBarsW = barW * seriesCount + BAR_GAP * (seriesCount - 1);
      const startX = groupX + (groupW - totalBarsW) / 2;

      for (let si = 0; si < seriesCount; si++) {
        const val = series[si].values[i] ?? 0;
        const x = startX + si * (barW + BAR_GAP);
        const barH = Math.max(0, (val / yMax) * chartH);
        const y = PAD_T + chartH - barH;

        // Bar gradient
        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, series[si].color + "cc");
        grad.addColorStop(1, series[si].color + "55");

        ctx.beginPath();
        const r = Math.min(3, barW / 2);
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, y + barH);
        ctx.lineTo(x, y + barH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // X label
      ctx.fillStyle = "rgba(147,197,253,0.45)";
      ctx.textAlign = "center";
      ctx.font = "10px sans-serif";
      const label = xLabels[i].slice(5); // strip YYYY- to show MM-DD
      ctx.fillText(label, groupX + groupW / 2, H - 8);
    }

    // Unit label
    if (unit) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(147,197,253,0.3)";
      ctx.font = "10px sans-serif";
      ctx.fillText(unit, W - PAD_R, PAD_T + 10);
    }
  }, [series, xLabels, height, unit]);

  // Legend
  return (
    <div>
      <canvas ref={ref} style={{ width: "100%", height, display: "block" }} />
      {series.length > 1 && (
        <div className="flex items-center gap-4 mt-2 pl-10">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: s.color }} />
              <span className="text-[11px] text-blue-200/50">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
