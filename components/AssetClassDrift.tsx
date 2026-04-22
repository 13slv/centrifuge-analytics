"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import type { Pool, PoolHistory } from "@/lib/types";

const PALETTE = [
  "#7c5cff",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#a855f7",
];

const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;
const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export function AssetClassDrift({
  pools,
  histories,
  mode = "share",
}: {
  pools: Pool[];
  histories: PoolHistory[];
  mode?: "share" | "absolute";
}) {
  const { rows, classes } = useMemo(() => {
    const histMap = new Map(histories.map((h) => [h.poolId, h]));
    // Normalize asset classes (dedup case)
    const norm = (s: string) =>
      s === "Private credit" ? "Private Credit" : s === "Public credit" ? "Public Credit" : s;

    // Aggregate all dates and classes
    const dateSet = new Set<string>();
    const classTvlByDate = new Map<string, Map<string, number>>();
    for (const p of pools) {
      const h = histMap.get(p.id);
      if (!h) continue;
      const cls = norm(p.assetClass);
      for (const pt of h.series) {
        dateSet.add(pt.date);
        let inner = classTvlByDate.get(pt.date);
        if (!inner) {
          inner = new Map();
          classTvlByDate.set(pt.date, inner);
        }
        inner.set(cls, (inner.get(cls) ?? 0) + pt.tvl_usd);
      }
    }
    const dates = Array.from(dateSet).sort();

    // Pick top 7 classes by peak TVL; bucket rest into "Other"
    const peakByClass = new Map<string, number>();
    for (const m of classTvlByDate.values()) {
      for (const [c, v] of m) {
        peakByClass.set(c, Math.max(peakByClass.get(c) ?? 0, v));
      }
    }
    const topClasses = Array.from(peakByClass.entries())
      .filter(([, v]) => v > 100_000)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([c]) => c);
    const classes = [...topClasses, "Other"];

    const rows = dates.map((date) => {
      const m = classTvlByDate.get(date) ?? new Map();
      const row: Record<string, string | number> = { date };
      let total = 0;
      const perClass = new Map<string, number>();
      for (const [c, v] of m) {
        const key = topClasses.includes(c) ? c : "Other";
        perClass.set(key, (perClass.get(key) ?? 0) + v);
        total += v;
      }
      for (const c of classes) {
        const v = perClass.get(c) ?? 0;
        row[c] = mode === "share" ? (total > 0 ? v / total : 0) : v;
      }
      return row;
    });
    return { rows, classes };
  }, [pools, histories, mode]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          stroke="#666"
          fontSize={11}
          tickFormatter={(d: string) => d.slice(5)}
          minTickGap={60}
        />
        <YAxis
          stroke="#666"
          fontSize={11}
          tickFormatter={mode === "share" ? fmtPct : fmtUsd}
          width={60}
          domain={mode === "share" ? [0, 1] : undefined}
        />
        <Tooltip
          contentStyle={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "#aaa" }}
          formatter={(v, name) => [
            mode === "share" ? `${(Number(v) * 100).toFixed(1)}%` : fmtUsd(Number(v)),
            String(name),
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: "#aaa" }} />
        {classes.map((c, i) => (
          <Area
            key={c}
            type="monotone"
            dataKey={c}
            stackId="1"
            stroke={PALETTE[i % PALETTE.length]}
            fill={PALETTE[i % PALETTE.length]}
            fillOpacity={0.6}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
