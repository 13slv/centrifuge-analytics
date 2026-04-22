"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HolderSnapshot, TopHolder } from "@/lib/types";

const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export function HoldersPanel({
  series,
  top,
  chain,
}: {
  series: HolderSnapshot[];
  top: TopHolder[];
  chain: string;
}) {
  const latest = series[series.length - 1];
  if (!latest || latest.holders === 0) {
    return (
      <div className="text-sm text-neutral-500">
        No investor transactions captured for this pool.
      </div>
    );
  }

  const explorer =
    chain === "arbitrum"
      ? "https://arbiscan.io/address/"
      : chain === "base"
        ? "https://basescan.org/address/"
        : "https://etherscan.io/address/";

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Holders" value={latest.holders.toString()} />
        <MetricCard
          label="Top-10 share"
          value={`${(latest.top10_share * 100).toFixed(1)}%`}
        />
        <MetricCard label="Gini" value={latest.gini.toFixed(2)} hint="0 = equal · 1 = monopoly" />
        <MetricCard
          label="HHI"
          value={latest.hhi.toFixed(3)}
          hint="0 = fragmented · 1 = monopoly"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs text-neutral-500 mb-2">Holder count over time</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                stroke="#666"
                fontSize={10}
                tickFormatter={(d: string) => d.slice(5)}
                minTickGap={50}
              />
              <YAxis stroke="#666" fontSize={10} width={35} />
              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#aaa" }}
              />
              <Line
                type="monotone"
                dataKey="holders"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h3 className="text-xs text-neutral-500 mb-2">Top-10 share over time</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                stroke="#666"
                fontSize={10}
                tickFormatter={(d: string) => d.slice(5)}
                minTickGap={50}
              />
              <YAxis
                stroke="#666"
                fontSize={10}
                width={40}
                domain={[0, 1]}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#aaa" }}
                formatter={(v) => [`${(Number(v ?? 0) * 100).toFixed(1)}%`, "top-10"]}
              />
              <Line
                type="monotone"
                dataKey="top10_share"
                stroke="#f43f5e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-xs text-neutral-500 mb-2">Top holders (current)</h3>
        <div className="border border-neutral-900 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-neutral-400">
              <tr>
                <th className="text-left px-3 py-2 font-normal w-8">#</th>
                <th className="text-left px-3 py-2 font-normal">Address</th>
                <th className="text-right px-3 py-2 font-normal">Balance</th>
                <th className="text-right px-3 py-2 font-normal">Share</th>
                <th className="text-left px-3 py-2 font-normal">First seen</th>
              </tr>
            </thead>
            <tbody>
              {top.slice(0, 10).map((h, i) => (
                <tr key={h.account} className="border-t border-neutral-900">
                  <td className="px-3 py-2 text-neutral-600">{i + 1}</td>
                  <td className="px-3 py-2">
                    <a
                      href={`${explorer}${h.account}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-neutral-300 hover:text-violet-400"
                    >
                      {h.account.slice(0, 10)}…{h.account.slice(-8)}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtUsd(h.balance_usd)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                    {(h.share * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-neutral-500 text-xs">{h.first_seen || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-neutral-900 rounded-md px-3 py-2 bg-neutral-950">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-neutral-600 mt-0.5">{hint}</div>}
    </div>
  );
}
