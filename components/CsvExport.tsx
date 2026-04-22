"use client";

import type {
  ApyPoint,
  DailyFlow,
  HolderSnapshot,
  Pool,
  TvlPoint,
} from "@/lib/types";

function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c] ?? "")).join(","));
  return lines.join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvExportButton({
  pool,
  series,
  flows,
  apy,
  holders,
}: {
  pool: Pool;
  series: TvlPoint[];
  flows: DailyFlow[];
  apy: ApyPoint[];
  holders: HolderSnapshot[];
}) {
  const onClick = () => {
    const apyMap = new Map(apy.map((a) => [a.date, a.apy]));
    const flowMap = new Map(flows.map((f) => [f.date, f]));
    const holdMap = new Map(holders.map((h) => [h.date, h]));
    const rows = series.map((s) => {
      const f = flowMap.get(s.date);
      const h = holdMap.get(s.date);
      return {
        date: s.date,
        tvl_usd: s.tvl_usd.toFixed(2),
        apy_30d: apyMap.get(s.date)?.toFixed(6) ?? "",
        inflow_usd: f?.inflow_usd.toFixed(2) ?? "0",
        outflow_usd: f?.outflow_usd.toFixed(2) ?? "0",
        yield_usd: f?.yield_usd.toFixed(2) ?? "0",
        holders: h?.holders ?? "",
        top10_share: h?.top10_share.toFixed(4) ?? "",
        gini: h?.gini.toFixed(4) ?? "",
      };
    });
    const slug = (pool.shortName || pool.name).replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    download(`${slug}_daily.csv`, toCsv(rows));
  };
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1 border border-neutral-800 rounded hover:bg-neutral-900 text-neutral-400 hover:text-neutral-200"
    >
      ⇣ Download CSV
    </button>
  );
}
