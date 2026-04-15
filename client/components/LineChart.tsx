"use client";
import { useEffect, useRef } from "react";

export interface LineSeries {
  label: string;
  data: number[];
  color: string;
}

interface Props {
  series: LineSeries[];
  height?: number;
  unit?: string;
  /** Optional X-axis labels; if omitted, indices are used */
  xLabels?: string[];
  showGrid?: boolean;
}

export default function LineChart({ series, height = 180, unit = "", xLabels, showGrid = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const PAD_L = 42;
    const PAD_R = 12;
    const PAD_T = 12;
    const PAD_B = 28;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    // Compute global min/max across all series
    const allVals = series.flatMap((s) => s.data);
    if (allVals.length === 0) return;
    const rawMax = Math.max(...allVals, 0.001);
    const rawMin = Math.min(...allVals, 0);
    const range = rawMax - rawMin || 1;
    const max = rawMax + range * 0.08;
    const min = rawMin - range * 0.04;
    const span = max - min || 1;

    const maxLen = Math.max(...series.map((s) => s.data.length), 1);

    const toX = (i: number) => PAD_L + (i / Math.max(maxLen - 1, 1)) * chartW;
    const toY = (v: number) => PAD_T + (1 - (v - min) / span) * chartH;

    // Grid lines
    if (showGrid) {
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
    }

    // Y-axis labels
    ctx.fillStyle = "rgba(147,197,253,0.45)";
    ctx.font = `${10 * (dpr > 1 ? 1 : 1)}px monospace`;
    ctx.textAlign = "right";
    const yTicks = 4;
    for (let t = 0; t <= yTicks; t++) {
      const v = min + (span * (yTicks - t)) / yTicks;
      const y = PAD_T + (t / yTicks) * chartH;
      ctx.fillText(v.toFixed(2), PAD_L - 4, y + 3);
    }

    // X-axis labels (sparse — at most 6)
    if (xLabels && xLabels.length > 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(147,197,253,0.35)";
      const step = Math.max(1, Math.floor(xLabels.length / 6));
      for (let i = 0; i < xLabels.length; i += step) {
        ctx.fillText(xLabels[i], toX(i), H - 6);
      }
    } else {
      // Show index ticks at start, mid, end
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(147,197,253,0.25)";
      const pts = [0, Math.floor((maxLen - 1) / 2), maxLen - 1];
      for (const i of pts) {
        if (i >= 0) ctx.fillText(`${i}`, toX(i), H - 6);
      }
    }

    // Draw each series
    for (const s of series) {
      if (s.data.length < 2) continue;

      // Gradient fill under the line
      const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + chartH);
      grad.addColorStop(0, s.color + "30");
      grad.addColorStop(1, s.color + "00");

      ctx.beginPath();
      ctx.moveTo(toX(0), PAD_T + chartH);
      for (let i = 0; i < s.data.length; i++) ctx.lineTo(toX(i), toY(s.data[i]));
      ctx.lineTo(toX(s.data.length - 1), PAD_T + chartH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (let i = 0; i < s.data.length; i++) {
        if (i === 0) ctx.moveTo(toX(i), toY(s.data[i]));
        else ctx.lineTo(toX(i), toY(s.data[i]));
      }
      ctx.stroke();

      // Latest value dot
      const last = s.data[s.data.length - 1];
      ctx.beginPath();
      ctx.arc(toX(s.data.length - 1), toY(last), 4, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    }

    // Unit label top-right
    if (unit) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(147,197,253,0.3)";
      ctx.font = "10px sans-serif";
      ctx.fillText(unit, W - PAD_R, PAD_T + 10);
    }
  }, [series, height, unit, xLabels, showGrid]);

  return (
    <canvas
      ref={ref}
      style={{ width: "100%", height, display: "block" }}
    />
  );
}
