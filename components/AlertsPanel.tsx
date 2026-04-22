import Link from "next/link";
import type { Pool, PoolFlows, PoolHistory, PoolHolders } from "@/lib/types";

type Alert = {
  kind: "large_redeem" | "large_inflow" | "apy_drop" | "concentration_spike" | "tvl_drop";
  pool: Pool;
  date: string;
  magnitude: number; // fraction for %-based, USD for dollar-based
  detail: string;
};

const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

function buildAlerts(
  pools: Pool[],
  histories: PoolHistory[],
  flowsByPool: Map<string, PoolFlows>,
  holdersByPool: Map<string, PoolHolders>,
  lookbackDays = 14,
): Alert[] {
  const out: Alert[] = [];
  const histMap = new Map(histories.map((h) => [h.poolId, h]));

  for (const pool of pools) {
    const h = histMap.get(pool.id);
    if (!h || h.series.length === 0) continue;
    const currentTvl = h.series[h.series.length - 1].tvl_usd;
    if (currentTvl < 100_000) continue; // skip tiny pools

    const recent = h.series.slice(-lookbackDays);

    // TVL drop
    if (recent.length > 1) {
      const start = recent[0].tvl_usd;
      const end = recent[recent.length - 1].tvl_usd;
      if (start > 0 && (start - end) / start > 0.1) {
        out.push({
          kind: "tvl_drop",
          pool,
          date: recent[recent.length - 1].date,
          magnitude: (end - start) / start,
          detail: `TVL ${fmtUsd(start)} → ${fmtUsd(end)} in ${lookbackDays}d`,
        });
      }
    }

    // Large redemptions / inflows in recent window
    const flowsRec = flowsByPool.get(pool.id)?.flows.slice(-lookbackDays) ?? [];
    for (const f of flowsRec) {
      if (f.outflow_usd > 0.05 * currentTvl && f.outflow_usd > 500_000) {
        out.push({
          kind: "large_redeem",
          pool,
          date: f.date,
          magnitude: f.outflow_usd / currentTvl,
          detail: `${fmtUsd(f.outflow_usd)} redeemed (${((f.outflow_usd / currentTvl) * 100).toFixed(1)}% of TVL)`,
        });
      }
      if (f.inflow_usd > 0.1 * currentTvl && f.inflow_usd > 1_000_000) {
        out.push({
          kind: "large_inflow",
          pool,
          date: f.date,
          magnitude: f.inflow_usd / currentTvl,
          detail: `${fmtUsd(f.inflow_usd)} new inflow`,
        });
      }
    }

    // APY drop
    const apy = h.apySeries ?? [];
    if (apy.length >= lookbackDays) {
      const past = apy[Math.max(0, apy.length - lookbackDays)].apy;
      const now = apy[apy.length - 1].apy;
      if (past > 0.01 && past - now > 0.01) {
        out.push({
          kind: "apy_drop",
          pool,
          date: apy[apy.length - 1].date,
          magnitude: past - now,
          detail: `APY ${(past * 100).toFixed(2)}% → ${(now * 100).toFixed(2)}%`,
        });
      }
    }

    // Concentration spike
    const holders = holdersByPool.get(pool.id)?.series ?? [];
    if (holders.length >= lookbackDays) {
      const past = holders[Math.max(0, holders.length - lookbackDays)].top10_share;
      const now = holders[holders.length - 1].top10_share;
      if (now - past > 0.1) {
        out.push({
          kind: "concentration_spike",
          pool,
          date: holders[holders.length - 1].date,
          magnitude: now - past,
          detail: `top-10 ${(past * 100).toFixed(0)}% → ${(now * 100).toFixed(0)}%`,
        });
      }
    }
  }

  // rank by severity heuristic: USD flows first, then large % drops
  return out
    .sort((a, b) => {
      const score = (x: Alert) => {
        if (x.kind === "large_redeem" || x.kind === "large_inflow") {
          return x.magnitude * 1_000 + 500; // weight $ flows high
        }
        return Math.abs(x.magnitude) * 1_000;
      };
      return score(b) - score(a);
    })
    .slice(0, 8);
}

export function AlertsPanel({
  pools,
  histories,
  poolFlows,
  poolHolders,
}: {
  pools: Pool[];
  histories: PoolHistory[];
  poolFlows?: PoolFlows[];
  poolHolders?: PoolHolders[];
}) {
  const flowsMap = new Map((poolFlows ?? []).map((f) => [f.poolId, f]));
  const holdersMap = new Map((poolHolders ?? []).map((h) => [h.poolId, h]));
  const alerts = buildAlerts(pools, histories, flowsMap, holdersMap);

  if (alerts.length === 0) {
    return <div className="text-sm text-neutral-500">No notable changes in the last 14 days.</div>;
  }

  const icon: Record<Alert["kind"], string> = {
    large_redeem: "↓",
    large_inflow: "↑",
    apy_drop: "◊",
    concentration_spike: "▲",
    tvl_drop: "▼",
  };
  const color: Record<Alert["kind"], string> = {
    large_redeem: "text-rose-400",
    large_inflow: "text-emerald-400",
    apy_drop: "text-amber-400",
    concentration_spike: "text-orange-400",
    tvl_drop: "text-rose-400",
  };

  return (
    <div className="border border-neutral-900 rounded-md overflow-hidden">
      {alerts.map((a, i) => (
        <Link
          key={i}
          href={`/pools/${encodeURIComponent(a.pool.id)}`}
          className="flex items-center gap-3 px-3 py-2 border-b border-neutral-900 last:border-0 hover:bg-neutral-950"
        >
          <span className={`${color[a.kind]} w-5 text-center`}>{icon[a.kind]}</span>
          <span className="text-sm text-neutral-300 flex-1 truncate">
            {a.pool.shortName || a.pool.name}
          </span>
          <span className="text-xs text-neutral-500">{a.detail}</span>
          <span className="text-xs text-neutral-600 tabular-nums">{a.date}</span>
        </Link>
      ))}
    </div>
  );
}
