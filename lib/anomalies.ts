/**
 * Detect data quality anomalies for the dashboard observability panel.
 * Pure functions — given current data, return list of issues.
 */
import type { Dataset } from "./types";
import type { RwaDataset } from "./rwa-types";

export type Anomaly = {
  severity: "info" | "warn" | "error";
  category: "freshness" | "value" | "consistency";
  message: string;
  context?: string;
};

/** How recent is the dataset? Returns minutes since generatedAt. */
export function ageMinutes(generatedAt: string): number {
  return (Date.now() - new Date(generatedAt).getTime()) / 60_000;
}

/** Centrifuge dataset anomalies. */
export function centrifugeAnomalies(d: Dataset): Anomaly[] {
  const out: Anomaly[] = [];
  const age = ageMinutes(d.generatedAt);
  if (age > 60 * 36) {
    out.push({
      severity: "warn",
      category: "freshness",
      message: `Centrifuge data is ${(age / 60).toFixed(0)}h old`,
      context: "Daily cron may be failing — check GitHub Actions",
    });
  }

  // APY outliers in material pools
  for (const h of d.histories) {
    if (!h.apySeries || h.apySeries.length === 0) continue;
    const lastApy = h.apySeries[h.apySeries.length - 1].apy;
    const pool = d.pools.find((p) => p.id === h.poolId);
    const lastTvl = h.series[h.series.length - 1]?.tvl_usd ?? 0;
    if (lastTvl < 1_000_000) continue; // skip tiny pools
    if (lastApy > 0.5) {
      out.push({
        severity: "warn",
        category: "value",
        message: `${pool?.shortName ?? pool?.name ?? h.poolId} APY ${(lastApy * 100).toFixed(0)}%`,
        context: "Likely indexer artefact (since-inception distortion)",
      });
    }
    if (lastApy < -0.5) {
      out.push({
        severity: "warn",
        category: "value",
        message: `${pool?.shortName ?? pool?.name ?? h.poolId} APY ${(lastApy * 100).toFixed(0)}%`,
        context: "Severe negative — verify via issuer site",
      });
    }
  }

  // Concentration spike >10pp in 14 days
  for (const ph of d.poolHolders ?? []) {
    if (ph.series.length < 14) continue;
    const past = ph.series[ph.series.length - 14].top10_share;
    const now = ph.series[ph.series.length - 1].top10_share;
    if (now - past > 0.1) {
      const pool = d.pools.find((p) => p.id === ph.poolId);
      out.push({
        severity: "info",
        category: "value",
        message: `${pool?.shortName ?? ph.poolId} top-10 share +${((now - past) * 100).toFixed(0)}pp in 14d`,
        context: "Concentration consolidating — track for whale moves",
      });
    }
  }

  return out;
}

/** RWA dataset anomalies. */
export function rwaAnomalies(d: RwaDataset): Anomaly[] {
  const out: Anomaly[] = [];
  const age = ageMinutes(d.generatedAt);
  if (age > 60 * 36) {
    out.push({
      severity: "warn",
      category: "freshness",
      message: `RWA data is ${(age / 60).toFixed(0)}h old`,
    });
  }

  // Big delta vs RWA.xyz
  for (const p of d.products) {
    if (p.tvl_delta_pct == null) continue;
    if (Math.abs(p.tvl_delta_pct) > 0.5) {
      out.push({
        severity: p.tvl_delta_pct > 1.0 ? "error" : "warn",
        category: "consistency",
        message: `${p.symbol} TVL ${p.tvl_delta_pct >= 0 ? "+" : ""}${(p.tvl_delta_pct * 100).toFixed(0)}% vs RWA.xyz reference`,
        context: "Either off-chain supply outdated or RWA.xyz reference stale",
      });
    }
  }

  // Tiny products (TVL < $1M but registered) — informational only
  const tiny = d.products.filter((p) => p.tvl_usd < 1_000_000);
  if (tiny.length > 0) {
    out.push({
      severity: "info",
      category: "value",
      message: `${tiny.length} product(s) with <$1M TVL`,
      context: tiny.map((p) => p.symbol).join(", "),
    });
  }

  return out;
}
