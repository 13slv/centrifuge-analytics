"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TvlPoint } from "@/lib/types";

export function TvlChart({
  data,
  height = 280,
  color = "#7c5cff",
}: {
  data: TvlPoint[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-neutral-500"
        style={{ height }}
      >
        no data yet
      </div>
    );
  }

  const fmt = (n: number) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <defs>
          <linearGradient id="tvlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          stroke="#666"
          fontSize={11}
          tickFormatter={(d: string) => d.slice(5)}
          minTickGap={60}
        />
        <YAxis stroke="#666" fontSize={11} tickFormatter={fmt} width={60} />
        <Tooltip
          contentStyle={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "#aaa" }}
          formatter={(v) => [fmt(Number(v ?? 0)), "TVL"]}
        />
        <Area
          type="monotone"
          dataKey="tvl_usd"
          stroke={color}
          strokeWidth={2}
          fill="url(#tvlFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
