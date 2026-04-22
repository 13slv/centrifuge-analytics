import type { Pool, PoolHistory, TvlPoint } from "./types";

export function peakTvl(series: TvlPoint[]): number {
  let m = 0;
  for (const p of series) if (p.tvl_usd > m) m = p.tvl_usd;
  return m;
}

export function currentTvl(series: TvlPoint[]): number {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].tvl_usd > 0) return series[i].tvl_usd;
  }
  return 0;
}

export function totalTvlByDate(
  pools: Pool[],
  histories: PoolHistory[],
): { date: string; tvl_usd: number }[] {
  const byDate = new Map<string, number>();
  const map = new Map(histories.map((h) => [h.poolId, h]));
  for (const p of pools) {
    const h = map.get(p.id);
    if (!h) continue;
    for (const pt of h.series) {
      byDate.set(pt.date, (byDate.get(pt.date) ?? 0) + pt.tvl_usd);
    }
  }
  const dates = Array.from(byDate.keys()).sort();
  return dates.map((d) => ({ date: d, tvl_usd: byDate.get(d)! }));
}

export function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
