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
  "#7c5cff", // violet
  "#10b981", // emerald
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#ef4444", // rose
  "#a855f7", // purple
  "#3b82f6", // blue
];

const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

/**
 * Stacked area chart showing the composition of total TVL by pool.
 * Top N pools rendered individually, the rest bucketed as "Other".
 */
export function PoolTvlStack({
  pools,
  histories,
  topN = 7,
  height = 320,
}: {
  pools: Pool[];
  histories: PoolHistory[];
  topN?: number;
  height?: number;
}) {
  const { rows, layers } = useMemo(() => {
    const histMap = new Map(histories.map((h) => [h.poolId, h]));

    // Pick top N pools by current TVL
    const sortedPools = [...pools]
      .map((p) => {
        const h = histMap.get(p.id);
        const series = h?.series ?? [];
        const current = series[series.length - 1]?.tvl_usd ?? 0;
        return { pool: p, current };
      })
      .filter((x) => x.current > 0)
      .sort((a, b) => b.current - a.current);

    const top = sortedPools.slice(0, topN).map((x) => x.pool);
    const rest = sortedPools.slice(topN).map((x) => x.pool);
    const layerLabels = [
      ...top.map((p) => p.shortName || p.name),
      ...(rest.length > 0 ? [`Other (${rest.length} pools)`] : []),
    ];

    // Collect all dates that appear in any pool's history
    const dateSet = new Set<string>();
    for (const p of [...top, ...rest]) {
      const h = histMap.get(p.id);
      if (h) for (const pt of h.series) dateSet.add(pt.date);
    }
    const dates = Array.from(dateSet).sort();

    // Build per-date row: top pools as own columns, rest bucketed
    const rowList = dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const p of top) {
        const h = histMap.get(p.id);
        const match = h?.series.find((s) => s.date === date);
        row[p.shortName || p.name] = match?.tvl_usd ?? 0;
      }
      if (rest.length > 0) {
        let other = 0;
        for (const p of rest) {
          const h = histMap.get(p.id);
          const match = h?.series.find((s) => s.date === date);
          other += match?.tvl_usd ?? 0;
        }
        row[layerLabels[layerLabels.length - 1]] = other;
      }
      return row;
    });

    return { rows: rowList, layers: layerLabels };
  }, [pools, histories, topN]);

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-neutral-500"
        style={{ height }}
      >
        no data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          stroke="#666"
          fontSize={11}
          tickFormatter={(d: string) => d.slice(5)}
          minTickGap={60}
        />
        <YAxis stroke="#666" fontSize={11} tickFormatter={fmtUsd} width={60} />
        <Tooltip
          contentStyle={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "#aaa" }}
          itemSorter={(item) => -(item.value as number)}
          formatter={(v, name) => [fmtUsd(Number(v ?? 0)), String(name)]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#aaa" }}
          iconType="square"
        />
        {layers.map((label, i) => (
          <Area
            key={label}
            type="monotone"
            dataKey={label}
            stackId="1"
            stroke={PALETTE[i % PALETTE.length]}
            fill={PALETTE[i % PALETTE.length]}
            fillOpacity={0.55}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
