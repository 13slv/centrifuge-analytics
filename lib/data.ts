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

/**
 * Whether a pool should count toward "active TVL" views.
 * Matches Centrifuge's own Products page — excludes Tinlake v2 (all in
 * wind-down since 2024) and any pool with residual / near-zero holdings.
 */
export function isLivePool(pool: Pool, history: PoolHistory | undefined): boolean {
  if (pool.status === "closed") return false;
  if (pool.version === "tinlake_v2") return false;
  const cur = currentTvl(history?.series ?? []);
  return cur >= 100_000;
}

export function livePools(
  pools: Pool[],
  histories: PoolHistory[],
): Pool[] {
  const map = new Map(histories.map((h) => [h.poolId, h]));
  return pools.filter((p) => isLivePool(p, map.get(p.id)));
}

export function totalTvlByDate(
  pools: Pool[],
  histories: PoolHistory[],
): { date: string; tvl_usd: number }[] {
  const byDate = new Map<string, number>();
  const map = new Map(histories.map((h) => [h.poolId, h]));
  const live = new Set(livePools(pools, histories).map((p) => p.id));
  for (const p of pools) {
    if (!live.has(p.id)) continue;
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
