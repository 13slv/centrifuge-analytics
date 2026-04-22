"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  Pool,
  PoolFlows,
  PoolHistory,
  PoolHolders,
} from "@/lib/types";

const PALETTE = ["#7c5cff", "#10b981", "#f59e0b"];

const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function CompareView({
  pools,
  histories,
  poolFlows,
  poolHolders,
}: {
  pools: Pool[];
  histories: PoolHistory[];
  poolFlows: PoolFlows[];
  poolHolders: PoolHolders[];
}) {
  const withData = useMemo(() => {
    const hmap = new Map(histories.map((h) => [h.poolId, h]));
    return pools
      .filter((p) => (hmap.get(p.id)?.series ?? []).some((s) => s.tvl_usd > 0))
      .sort((a, b) => {
        const pa =
          hmap.get(a.id)?.series.reduce((m, s) => Math.max(m, s.tvl_usd), 0) ?? 0;
        const pb =
          hmap.get(b.id)?.series.reduce((m, s) => Math.max(m, s.tvl_usd), 0) ?? 0;
        return pb - pa;
      });
  }, [pools, histories]);

  const [selected, setSelected] = useState<string[]>(() => {
    return withData.slice(0, 2).map((p) => p.id);
  });

  const histMap = useMemo(() => new Map(histories.map((h) => [h.poolId, h])), [histories]);
  const holderMap = useMemo(
    () => new Map(poolHolders.map((h) => [h.poolId, h])),
    [poolHolders],
  );

  const tvlRows = useMemo(() => {
    const dateSet = new Set<string>();
    for (const pid of selected) {
      const h = histMap.get(pid);
      if (h) for (const s of h.series) dateSet.add(s.date);
    }
    const dates = Array.from(dateSet).sort();
    return dates.map((date) => {
      const row: Record<string, string | number | null> = { date };
      for (const pid of selected) {
        const h = histMap.get(pid);
        const match = h?.series.find((s) => s.date === date);
        row[pid] = match ? match.tvl_usd : null;
      }
      return row;
    });
  }, [selected, histMap]);

  const apyRows = useMemo(() => {
    const dateSet = new Set<string>();
    for (const pid of selected) {
      const h = histMap.get(pid);
      if (h?.apySeries) for (const a of h.apySeries) dateSet.add(a.date);
    }
    const dates = Array.from(dateSet).sort();
    return dates.map((date) => {
      const row: Record<string, string | number | null> = { date };
      for (const pid of selected) {
        const h = histMap.get(pid);
        const match = h?.apySeries?.find((a) => a.date === date);
        row[pid] = match ? match.apy * 100 : null;
      }
      return row;
    });
  }, [selected, histMap]);

  const poolName = (id: string) => {
    const p = pools.find((x) => x.id === id);
    return p?.shortName || p?.name || id;
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (s.length >= 3) return [s[1], s[2], id];
      return [...s, id];
    });
  };

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-neutral-500 mb-2">
          Pick 1-3 pools ({selected.length} selected)
        </div>
        <div className="flex flex-wrap gap-2">
          {withData.slice(0, 20).map((p) => {
            const i = selected.indexOf(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`text-xs px-2 py-1 rounded border ${
                  i >= 0
                    ? "border-violet-500 bg-violet-500/20 text-violet-300"
                    : "border-neutral-800 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {p.shortName || p.name}
              </button>
            );
          })}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-sm text-neutral-400 mb-3">TVL (overlay)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={tvlRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
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
              formatter={(v, name) => [fmtUsd(Number(v ?? 0)), poolName(String(name))]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "#aaa" }}
              formatter={(v) => poolName(String(v))}
            />
            {selected.map((pid, i) => (
              <Line
                key={pid}
                type="monotone"
                dataKey={pid}
                stroke={PALETTE[i]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="mb-8">
        <h2 className="text-sm text-neutral-400 mb-3">APY 30d (overlay)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={apyRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
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
              tickFormatter={fmtPct}
              width={50}
            />
            <Tooltip
              contentStyle={{
                background: "#111",
                border: "1px solid #333",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "#aaa" }}
              formatter={(v, name) => [fmtPct(Number(v ?? 0)), poolName(String(name))]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "#aaa" }}
              formatter={(v) => poolName(String(v))}
            />
            {selected.map((pid, i) => (
              <Line
                key={pid}
                type="monotone"
                dataKey={pid}
                stroke={PALETTE[i]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 className="text-sm text-neutral-400 mb-3">Snapshot</h2>
        <div className="border border-neutral-900 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-neutral-400">
              <tr>
                <th className="text-left px-3 py-2 font-normal">Pool</th>
                <th className="text-right px-3 py-2 font-normal">TVL</th>
                <th className="text-right px-3 py-2 font-normal">APY 30d</th>
                <th className="text-right px-3 py-2 font-normal">Holders</th>
                <th className="text-right px-3 py-2 font-normal">Top-10</th>
                <th className="text-right px-3 py-2 font-normal">Gini</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((pid, i) => {
                const h = histMap.get(pid);
                const last = h?.series[h.series.length - 1];
                const apy = h?.apySeries?.[(h.apySeries.length ?? 1) - 1]?.apy;
                const hold = holderMap.get(pid)?.series;
                const lastH = hold?.[hold.length - 1];
                return (
                  <tr key={pid} className="border-t border-neutral-900">
                    <td className="px-3 py-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ background: PALETTE[i] }}
                      />
                      {poolName(pid)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {last ? fmtUsd(last.tvl_usd) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-400">
                      {apy != null ? `${(apy * 100).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {lastH?.holders ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                      {lastH ? `${(lastH.top10_share * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                      {lastH ? lastH.gini.toFixed(2) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
