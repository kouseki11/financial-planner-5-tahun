"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatRupiah, formatRupiahShort } from "@/lib/money";

/** Palet kategorikal tervalidasi (dataviz): urutan tetap, tidak diputar. */
export const VIZ = {
  s1: "var(--viz-1)",
  s2: "var(--viz-2)",
  s3: "var(--viz-3)",
  s4: "var(--viz-4)",
  s5: "var(--viz-5)",
  s6: "var(--viz-6)",
  grid: "var(--viz-grid)",
  text: "var(--viz-text)",
  muted: "var(--viz-muted)",
};

const SERIES = [VIZ.s1, VIZ.s2, VIZ.s3, VIZ.s4, VIZ.s5, VIZ.s6];

const axisProps = { tick: { fill: VIZ.muted, fontSize: 11 }, axisLine: { stroke: VIZ.grid }, tickLine: false as const };

function RupiahTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string }>; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-sm">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 tabular-nums">
          <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span> {typeof p.value === "number" ? formatRupiah(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

export interface SeriesPoint {
  label: string;
  [k: string]: string | number | null;
}

const H = 260;

/** 1. Perubahan gaji bulanan (step line). */
export function SalaryChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={VIZ.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval={11} />
        <YAxis {...axisProps} tickFormatter={formatRupiahShort} width={64} />
        <Tooltip content={<RupiahTooltip />} />
        <Line type="stepAfter" dataKey="amount" name="Gaji" stroke={VIZ.s1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 2. Alokasi gaji per kategori (donut + legenda). */
export function AllocationChart({ data }: { data: { name: string; value: number }[] }) {
  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((s, d) => s + d.value, 0);
  const items = rest > 0 ? [...top, { name: "Lainnya", value: rest }] : top;
  return (
    <ResponsiveContainer width="100%" height={H}>
      <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Pie data={items} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="var(--background)" strokeWidth={2} isAnimationActive={false}>
          {items.map((_, i) => (
            <Cell key={i} fill={i < SERIES.length ? SERIES[i] : VIZ.muted} />
          ))}
        </Pie>
        <Tooltip content={<RupiahTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** 3 & 5. Total aset bersih per skenario dari waktu ke waktu. */
export function NetWorthChart({ data, keys = ["conservative", "moderate", "optimistic"], names = ["Konservatif", "Moderat", "Optimistis"] }: { data: SeriesPoint[]; keys?: string[]; names?: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={VIZ.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval={11} />
        <YAxis {...axisProps} tickFormatter={formatRupiahShort} width={64} />
        <Tooltip content={<RupiahTooltip />} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => (
          <Area key={k} type="monotone" dataKey={k} name={names[i]} stroke={SERIES[i]} fill={SERIES[i]} fillOpacity={0.08} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** 4. Setoran vs estimasi keuntungan (stacked bar per tahun). */
export function DepositsVsGainsChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid stroke={VIZ.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={formatRupiahShort} width={64} />
        <Tooltip content={<RupiahTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="deposits" name="Akumulasi setoran" stackId="a" fill={VIZ.s1} stroke="var(--background)" strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="gains" name="Estimasi keuntungan/kerugian" stackId="a" fill={VIZ.s3} stroke="var(--background)" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 6. Rencana vs realisasi (grouped bar). */
export function PlanVsActualChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2} barCategoryGap="25%">
        <CartesianGrid stroke={VIZ.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={formatRupiahShort} width={64} />
        <Tooltip content={<RupiahTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="planned" name="Rencana" fill={VIZ.s1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="actual" name="Realisasi" fill={VIZ.s2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Komposisi aset per kelas untuk satu skenario (stacked area). */
export function AssetCompositionChart({ data, keys, names }: { data: SeriesPoint[]; keys: string[]; names: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={H}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={VIZ.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval={11} />
        <YAxis {...axisProps} tickFormatter={formatRupiahShort} width={64} />
        <Tooltip content={<RupiahTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => (
          <Area key={k} type="monotone" dataKey={k} name={names[i]} stackId="a" stroke="var(--background)" strokeWidth={1} fill={SERIES[i % SERIES.length]} fillOpacity={0.9} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
