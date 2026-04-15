"use client";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import MiniChart from "@/components/MiniChart";
import clsx from "clsx";

interface Props {
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  chartData: number[];
  chartColor: string;
  trend?: "up" | "down" | "stable";
  highlight?: boolean;
}

export default function StatCard({
  label,
  value,
  unit,
  icon,
  chartData,
  chartColor,
  trend,
  highlight,
}: Props) {
  const trendLabel = trend === "up" ? "↑ Rising" : trend === "down" ? "↓ Falling" : "— Stable";
  const trendColor = trend === "up" ? "success" : trend === "down" ? "danger" : "default";

  return (
    <Card
      className={clsx(
        "glass-card border-none shadow-none transition-all duration-300",
        highlight && "ring-2 ring-blue-400/40",
      )}
    >
      <CardBody className="p-5 gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-300/80">
            {icon}
            <span className="text-xs font-semibold uppercase tracking-widest text-blue-200/60">
              {label}
            </span>
          </div>
          {trend && (
            <Chip size="sm" color={trendColor} variant="flat" className="text-[10px]">
              {trendLabel}
            </Chip>
          )}
        </div>

        {/* Value */}
        <div className="flex items-end gap-2">
          <span className="stat-value text-4xl font-bold text-white leading-none">{value}</span>
          <span className="text-sm text-blue-200/60 mb-1">{unit}</span>
        </div>

        {/* Mini chart */}
        {chartData.length >= 2 && (
          <div className="mt-1 -mx-1">
            <MiniChart data={chartData} color={chartColor} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
