"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Pool, PoolHistory } from "@/lib/types";
import { currentTvl, formatUsd, peakTvl } from "@/lib/data";

type Row = {
  pool: Pool;
  current: number;
  peak: number;
  change30d: number | null;
};

function buildRows(pools: Pool[], histories: PoolHistory[]): Row[] {
  const m = new Map(histories.map((h) => [h.poolId, h]));
  return pools.map((p) => {
    const h = m.get(p.id);
    const series = h?.series ?? [];
    const current = currentTvl(series);
    const peak = peakTvl(series);
    let change30d: number | null = null;
    if (series.length > 30) {
      const past = series[series.length - 31].tvl_usd;
      if (past > 0) change30d = (current - past) / past;
    }
    return { pool: p, current, peak, change30d };
  });
}

type SortKey = "current" | "peak" | "change30d" | "name";

export function PoolsTable({
  pools,
  histories,
}: {
  pools: Pool[];
  histories: PoolHistory[];
}) {
  const rows = useMemo(() => buildRows(pools, histories), [pools, histories]);
  const [chain, setChain] = useState<string>("all");
  const [version, setVersion] = useState<string>("all");
  const [status, setStatus] = useState<string>("active");
  const [sort, setSort] = useState<SortKey>("current");

  const chains = useMemo(
    () => ["all", ...Array.from(new Set(pools.map((p) => p.chain)))],
    [pools],
  );

  const filtered = useMemo(() => {
    let r = rows;
    if (chain !== "all") r = r.filter((x) => x.pool.chain === chain);
    if (version !== "all") r = r.filter((x) => x.pool.version === version);
    if (status !== "all") r = r.filter((x) => x.pool.status === status);
    r = [...r].sort((a, b) => {
      if (sort === "name") return a.pool.name.localeCompare(b.pool.name);
      if (sort === "change30d")
        return (b.change30d ?? -Infinity) - (a.change30d ?? -Infinity);
      return b[sort] - a[sort];
    });
    return r;
  }, [rows, chain, version, status, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <Select label="chain" value={chain} onChange={setChain} options={chains} />
        <Select
          label="version"
          value={version}
          onChange={setVersion}
          options={["all", "cfg_v3", "tinlake_v2"]}
        />
        <Select
          label="status"
          value={status}
          onChange={setStatus}
          options={["all", "active", "closed"]}
        />
        <div className="ml-auto text-neutral-500">{filtered.length} pools</div>
      </div>
      <div className="border border-neutral-800 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-950 text-neutral-400">
            <tr>
              <Th onClick={() => setSort("name")} active={sort === "name"}>
                Pool
              </Th>
              <th className="text-left px-3 py-2 font-normal">Chain</th>
              <th className="text-left px-3 py-2 font-normal">Class</th>
              <th className="text-left px-3 py-2 font-normal">Version</th>
              <Th onClick={() => setSort("current")} active={sort === "current"} align="right">
                TVL
              </Th>
              <Th onClick={() => setSort("peak")} active={sort === "peak"} align="right">
                Peak
              </Th>
              <Th
                onClick={() => setSort("change30d")}
                active={sort === "change30d"}
                align="right"
              >
                30d %
              </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ pool, current, peak, change30d }) => (
              <tr
                key={pool.id}
                className="border-t border-neutral-900 hover:bg-neutral-950"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/pools/${encodeURIComponent(pool.id)}`}
                    className="hover:text-violet-400"
                  >
                    {pool.shortName || pool.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-neutral-400">{pool.chain}</td>
                <td className="px-3 py-2 text-neutral-400">{pool.assetClass}</td>
                <td className="px-3 py-2 text-neutral-500">
                  {pool.version === "cfg_v3" ? "V3" : "Tinlake"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {current > 0 ? formatUsd(current) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                  {peak > 0 ? formatUsd(peak) : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    change30d === null
                      ? "text-neutral-600"
                      : change30d >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                  }`}
                >
                  {change30d === null
                    ? "—"
                    : `${change30d >= 0 ? "+" : ""}${(change30d * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({
  children,
  onClick,
  active,
  align = "left",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 font-normal cursor-pointer select-none ${
        active ? "text-violet-400" : ""
      } text-${align}`}
    >
      {children}
      {active ? " ↓" : ""}
    </th>
  );
}
