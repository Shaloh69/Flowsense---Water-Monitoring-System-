"use client";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { SensorReading } from "@/lib/store/sensor-store";

interface Props {
  data: SensorReading[];
}

const cols = [
  { key: "timestamp", label: "Time" },
  { key: "flow_in_m3h", label: "IN (m³/h)" },
  { key: "flow_out_m3h", label: "OUT (m³/h)" },
  { key: "volume_in_m3", label: "Vol IN (m³)" },
  { key: "volume_out_m3", label: "Vol OUT (m³)" },
  { key: "pressure_psi", label: "Pressure (PSI)" },
];

function fmt(key: string, val: string | number) {
  if (key === "timestamp") {
    return new Date(val as string).toLocaleTimeString();
  }
  return Number(val).toFixed(4);
}

export default function HistoryTable({ data }: Props) {
  const rows = [...data].reverse().slice(0, 20);

  return (
    <Table
      aria-label="Sensor readings history"
      classNames={{
        base: "glass-card overflow-hidden",
        wrapper: "bg-transparent shadow-none p-0",
        th: "bg-blue-900/30 text-blue-200 text-xs uppercase tracking-wider border-b border-blue-800/30",
        td: "text-blue-100/80 font-mono text-sm border-b border-blue-900/20",
        tr: "hover:bg-blue-500/10 transition-colors",
      }}
    >
      <TableHeader columns={cols}>
        {(col) => <TableColumn key={col.key}>{col.label}</TableColumn>}
      </TableHeader>
      <TableBody items={rows} emptyContent="No readings yet — waiting for data...">
        {(row) => (
          <TableRow key={row.timestamp}>
            {(colKey) => (
              <TableCell>{fmt(colKey as string, row[colKey as keyof SensorReading])}</TableCell>
            )}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
