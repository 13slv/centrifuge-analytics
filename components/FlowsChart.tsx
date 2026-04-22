"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import type { DailyFlow } from "@/lib/types";

const fmt = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

type Row = {
  date: string;
  inflow: number;
  outflow: number; // negative in chart data
  yield: number;
};

// Bucket daily points into week/day depending on density (keeps chart readable)
function bucket(flows: DailyFlow[], days: number): Row[] {
  const grouped: Row[] = [];
  for (let i = 0; i < flows.length; i += days) {
    const slice = flows.slice(i, i + days);
    const inflow = slice.reduce((s, f) => s + f.inflow_usd, 0);
    const outflow = slice.reduce((s, f) => s + f.outflow_usd, 0);
    const y = slice.reduce((s, f) => s + f.yield_usd, 0);
    grouped.push({
      date: slice[slice.length - 1].date,
      inflow,
      outflow: -outflow,
      yield: y,
    });
  }
  return grouped;
}

export function FlowsChart({
  flows,
  height = 220,
}: {
  flows: DailyFlow[];
  height?: number;
}) {
  const data = useMemo(() => {
    if (flows.length === 0) return [];
    const bucketDays = flows.length > 180 ? 7 : 1;
    return bucket(flows, bucketDays);
  }, [flows]);

  const hasFlow = useMemo(
    () => data.some((r) => r.inflow !== 0 || r.outflow !== 0),
    [data],
  );

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-neutral-500"
        style={{ height }}
      >
        no flow data
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }} stackOffset="sign">
          <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            stroke="#666"
            fontSize={11}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={60}
          />
          <YAxis stroke="#666" fontSize={11} tickFormatter={fmt} width={60} />
          <ReferenceLine y={0} stroke="#333" />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "#aaa" }}
            formatter={(v, name) => {
              const nm = String(name);
              const label =
                nm === "inflow" ? "Inflow" : nm === "outflow" ? "Outflow" : "Yield";
              return [fmt(Number(v ?? 0)), label];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#aaa" }}
            iconType="square"
            formatter={(v) =>
              v === "inflow" ? "Inflow (deposits)" : v === "outflow" ? "Outflow (redeems)" : "Yield / NAV Δ"
            }
          />
          <Bar dataKey="inflow" stackId="flow" fill="#10b981" />
          <Bar dataKey="outflow" stackId="flow" fill="#ef4444" />
          <Bar dataKey="yield" stackId="flow" fill="#7c5cff" />
        </BarChart>
      </ResponsiveContainer>
      {!hasFlow && (
        <p className="text-xs text-neutral-600 mt-2">
          Deposits/redemptions not captured via investor transactions — all ΔTVL attributed
          to yield/NAV. (Pool uses admin-side share issuance, or Tinlake v2.)
        </p>
      )}
    </div>
  );
}
