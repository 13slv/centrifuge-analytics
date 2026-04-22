"use client";

import { useMemo, useState } from "react";
import type {
  ApyPoint,
  DailyFlow,
  HolderSnapshot,
  TvlPoint,
} from "@/lib/types";
import { TvlChart } from "@/components/TvlChart";
import { FlowsChart } from "@/components/FlowsChart";
import { EventsList } from "@/components/EventsList";

type Range = "30d" | "90d" | "YTD" | "all";

function cutoff(range: Range, dates: string[]): string {
  if (dates.length === 0) return "1970-01-01";
  const now = new Date();
  if (range === "YTD") return `${now.getUTCFullYear()}-01-01`;
  if (range === "all") return dates[0];
  const days = range === "30d" ? 30 : 90;
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function PoolCharts({
  series,
  flows,
  apy,
  benchmark,
  benchmarkLabel,
  chain,
}: {
  series: TvlPoint[];
  flows: DailyFlow[];
  apy: ApyPoint[];
  benchmark?: { date: string; value: number }[];
  benchmarkLabel?: string;
  chain: string;
}) {
  const [range, setRange] = useState<Range>("all");

  const filtered = useMemo(() => {
    const dates = series.map((p) => p.date);
    const from = cutoff(range, dates);
    return {
      series: series.filter((p) => p.date >= from),
      flows: flows.filter((f) => f.date >= from),
      apy: apy.filter((a) => a.date >= from),
      benchmark: benchmark?.filter((b) => b.date >= from),
    };
  }, [range, series, flows, apy, benchmark]);

  const options: Range[] = ["30d", "90d", "YTD", "all"];

  return (
    <>
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-neutral-500">Range:</span>
        <div className="inline-flex bg-neutral-950 border border-neutral-900 rounded-md overflow-hidden">
          {options.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 ${
                range === r
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-sm text-neutral-400 mb-3">
          TVL <span className="text-violet-400">(left)</span> · APY 30d{" "}
          <span className="text-amber-400">(right)</span> · events on the curve
        </h2>
        <TvlChart
          data={filtered.series}
          flows={filtered.flows}
          apy={filtered.apy}
          benchmark={filtered.benchmark}
          benchmarkLabel={benchmarkLabel}
          height={340}
        />
        {benchmark && (
          <p className="text-xs text-neutral-500 mt-1">
            Dashed grey line: <span className="text-neutral-300">{benchmarkLabel}</span>{" "}
            (FRED) — benchmark for this asset class.
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-sm text-neutral-400 mb-3">
          Daily flow decomposition — inflow / outflow / yield
        </h2>
        <FlowsChart flows={filtered.flows} height={220} />
      </section>

      <section className="mb-8">
        <h2 className="text-sm text-neutral-400 mb-3">Largest events</h2>
        <EventsList flows={filtered.flows} chain={chain} limit={12} />
      </section>
    </>
  );
}
