"use client";

import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import type { ApyPoint, DailyFlow, LargeEvent, TvlPoint } from "@/lib/types";

const fmt = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

type Row = {
  date: string;
  tvl_usd: number;
  apy_pct?: number | null;
  bench_pct?: number | null;
  deposit?: number | null;
  redeem?: number | null;
  eventLabel?: string;
};

type TvlWithEvents = {
  data: TvlPoint[];
  flows?: DailyFlow[];
  apy?: ApyPoint[];
  benchmark?: { date: string; value: number }[];
  benchmarkLabel?: string;
  height?: number;
  color?: string;
};

// dot component — renders distinct shapes for deposit vs redeem
function EventDot(props: {
  cx?: number;
  cy?: number;
  payload?: Row;
  kind: "deposit" | "redeem";
}) {
  const { cx, cy, payload, kind } = props;
  if (!cx || !cy) return null;
  const fill = kind === "deposit" ? "#10b981" : "#ef4444";
  const v = kind === "deposit" ? payload?.deposit : payload?.redeem;
  if (v == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={fill}
      stroke="#111"
      strokeWidth={1.5}
      opacity={0.9}
    />
  );
}

export function TvlChart({
  data,
  flows,
  apy,
  benchmark,
  benchmarkLabel,
  height = 280,
  color = "#7c5cff",
}: TvlWithEvents) {
  const rows = useMemo<Row[]>(() => {
    const flowMap = new Map<string, DailyFlow>();
    if (flows) for (const f of flows) flowMap.set(f.date, f);
    const apyMap = new Map<string, number>();
    if (apy) for (const a of apy) apyMap.set(a.date, a.apy);
    const benchMap = new Map<string, number>();
    if (benchmark) for (const b of benchmark) benchMap.set(b.date, b.value);
    // forward-fill benchmark (FRED has gaps on weekends)
    let lastBench: number | null = null;
    return data.map((p) => {
      const f = flowMap.get(p.date);
      const topEvent: LargeEvent | undefined = f?.large_events?.[0];
      const isDeposit = topEvent?.type === "deposit";
      const isRedeem = topEvent?.type === "redeem";
      const aVal = apyMap.get(p.date);
      if (benchMap.has(p.date)) lastBench = benchMap.get(p.date)!;
      return {
        date: p.date,
        tvl_usd: p.tvl_usd,
        apy_pct: aVal != null ? aVal * 100 : null,
        bench_pct: lastBench != null ? lastBench * 100 : null,
        deposit: isDeposit ? p.tvl_usd : null,
        redeem: isRedeem ? p.tvl_usd : null,
        eventLabel: topEvent
          ? `${topEvent.type === "deposit" ? "+" : "-"}${fmt(topEvent.amount_usd)}  ${topEvent.account.slice(0, 6)}…`
          : undefined,
      };
    });
  }, [data, flows, apy, benchmark]);
  const hasApy = rows.some((r) => r.apy_pct != null);
  const hasBench = rows.some((r) => r.bench_pct != null);

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-neutral-500"
        style={{ height }}
      >
        no data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
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
        <YAxis
          yAxisId="tvl"
          stroke="#666"
          fontSize={11}
          tickFormatter={fmt}
          width={60}
        />
        {(hasApy || hasBench) && (
          <YAxis
            yAxisId="apy"
            orientation="right"
            stroke="#f59e0b"
            fontSize={11}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            width={50}
            domain={[0, "auto"]}
          />
        )}
        <Tooltip
          contentStyle={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "#aaa" }}
          formatter={(v, name, item) => {
            const nm = String(name);
            if (nm === "tvl_usd") return [fmt(Number(v ?? 0)), "TVL"];
            if (nm === "apy_pct") {
              const num = Number(v ?? 0);
              return [`${num.toFixed(2)}%`, "APY 30d"];
            }
            if (nm === "bench_pct") {
              const num = Number(v ?? 0);
              return [`${num.toFixed(2)}%`, benchmarkLabel ?? "Benchmark"];
            }
            const payload = item?.payload as Row | undefined;
            if (nm === "deposit") return [payload?.eventLabel ?? "", "Large deposit"];
            if (nm === "redeem") return [payload?.eventLabel ?? "", "Large redeem"];
            return [v, nm];
          }}
        />
        <Area
          yAxisId="tvl"
          type="monotone"
          dataKey="tvl_usd"
          stroke={color}
          strokeWidth={2}
          fill="url(#tvlFill)"
          isAnimationActive={false}
        />
        {hasApy && (
          <Line
            yAxisId="apy"
            type="monotone"
            dataKey="apy_pct"
            stroke="#f59e0b"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        )}
        {hasBench && (
          <Line
            yAxisId="apy"
            type="monotone"
            dataKey="bench_pct"
            stroke="#64748b"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        )}
        <Scatter
          yAxisId="tvl"
          name="deposit"
          dataKey="deposit"
          shape={(props: unknown) => (
            <EventDot {...(props as { cx?: number; cy?: number; payload?: Row })} kind="deposit" />
          )}
        />
        <Scatter
          yAxisId="tvl"
          name="redeem"
          dataKey="redeem"
          shape={(props: unknown) => (
            <EventDot {...(props as { cx?: number; cy?: number; payload?: Row })} kind="redeem" />
          )}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
