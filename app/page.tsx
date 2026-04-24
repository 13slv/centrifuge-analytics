import Link from "next/link";
import { getDataset } from "@/lib/data.server";
import { formatUsd, totalTvlByDate, currentTvl, isLivePool } from "@/lib/data";
import { TvlChart } from "@/components/TvlChart";
import { PoolsTable } from "@/components/PoolsTable";
import { AssetClassDrift } from "@/components/AssetClassDrift";
import { CrossPoolOverlapList } from "@/components/CrossPoolOverlap";
import { AlertsPanel } from "@/components/AlertsPanel";
import { SectionNote } from "@/components/SectionNote";
import { DataQualityBadge } from "@/components/DataQualityBadge";
import { centrifugeAnomalies } from "@/lib/anomalies";
import {
  assetClassDriftInsight,
  breakdownInsight,
  crossPoolInsight,
  poolsTableInsight,
  totalTvlInsight,
} from "@/lib/insights";

export const revalidate = 3600;

export default async function HomePage() {
  const dataset = await getDataset();
  const { pools, histories, generatedAt, startDate, endDate, crossPoolOverlap, poolHolders, poolFlows } =
    dataset;
  const anomalies = centrifugeAnomalies(dataset);
  const histMap = new Map(histories.map((h) => [h.poolId, h]));
  const total = totalTvlByDate(pools, histories);
  const latest = total[total.length - 1]?.tvl_usd ?? 0;
  const peak = total.reduce((m, p) => Math.max(m, p.tvl_usd), 0);

  // Asset class rollup @ latest — only live pools, so totals match Centrifuge's UI.
  const byClass = new Map<string, number>();
  const byChain = new Map<string, number>();
  for (const p of pools) {
    const h = histMap.get(p.id);
    if (!isLivePool(p, h)) continue;
    const tvl = currentTvl(h?.series ?? []);
    byClass.set(p.assetClass, (byClass.get(p.assetClass) ?? 0) + tvl);
    byChain.set(p.chain, (byChain.get(p.chain) ?? 0) + tvl);
  }
  const activeLive = pools.filter((p) => isLivePool(p, histMap.get(p.id))).length;
  const classRows = Array.from(byClass.entries())
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 10);
  const chainRows = Array.from(byChain.entries())
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        <span className="px-3 py-1.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-700/50">
          Centrifuge
        </span>
        <Link
          href="/rwa"
          className="px-3 py-1.5 rounded-md border border-neutral-800 text-neutral-300 hover:bg-neutral-900 hover:text-violet-300 hover:border-violet-700/50"
        >
          RWA market →
        </Link>
        <Link
          href="/compare"
          className="px-3 py-1.5 rounded-md border border-neutral-800 text-neutral-300 hover:bg-neutral-900 hover:text-violet-300 hover:border-violet-700/50"
        >
          Compare pools
        </Link>
      </nav>

      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Centrifuge Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Live V3 pools only — matches Centrifuge&apos;s own Products page.
            {" "}Legacy Tinlake v2 pools are excluded from totals (still visible in the table below).
          </p>
        </div>
        <div className="w-full md:w-auto md:min-w-[280px]">
          <DataQualityBadge generatedAt={generatedAt} anomalies={anomalies} />
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Stat label="Current TVL" value={formatUsd(latest)} />
        <Stat label="Peak TVL (since Jan 2025)" value={formatUsd(peak)} />
        <Stat label="Active pools" value={activeLive.toString()} />
      </section>

      <section className="mb-10">
        <h2 className="text-sm text-neutral-400 mb-2">Total TVL — all Centrifuge pools</h2>
        <SectionNote
          read="Area = sum of every pool's USD TVL, one dot per day. Flat stretches + sudden step-ups are typical of RWA pools where value is added in discrete tranches (pool launches or admin mints)."
          insight={totalTvlInsight(total)}
        />
        <TvlChart data={total} height={320} />
      </section>

      <section className="mb-10">
        <h2 className="text-sm text-neutral-400 mb-2">Recent notable activity (last 14 days)</h2>
        <SectionNote
          read="Rows auto-generated from the last two weeks: large single-day redeems (>5% TVL), big inflows (>10% TVL), APY drops >100bps, and top-10 concentration jumps >10pp. Click a row to open the pool."
          insight={null}
        />
        <AlertsPanel
          pools={pools}
          histories={histories}
          poolFlows={poolFlows}
          poolHolders={poolHolders}
        />
      </section>

      <section className="mb-10">
        <h2 className="text-sm text-neutral-400 mb-2">
          Asset-class market-share drift (stacked, % of total TVL)
        </h2>
        <SectionNote
          read="Each colour = one asset class; height at a given date = its share of total Centrifuge TVL. Changes in slice width show rotation between asset classes over time."
          insight={assetClassDriftInsight(pools, histories)}
        />
        <AssetClassDrift pools={pools} histories={histories} mode="share" />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div>
          <h2 className="text-sm text-neutral-400 mb-2">TVL by asset class</h2>
          <SectionNote
            read="Snapshot at today's close. Bar width = class's share of total TVL."
            insight={breakdownInsight(classRows, "class")}
          />
          <BreakdownList rows={classRows} />
        </div>
        <div>
          <h2 className="text-sm text-neutral-400 mb-2">TVL by chain</h2>
          <SectionNote
            read="Sum of TVL for all pools living on each chain."
            insight={breakdownInsight(chainRows, "chain")}
          />
          <BreakdownList rows={chainRows} />
        </div>
      </section>

      {crossPoolOverlap && crossPoolOverlap.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm text-neutral-400 mb-2">
            Cross-pool investor overlap — where the same whales appear
          </h2>
          <SectionNote
            read="For each pair of pools, count addresses that hold a non-dust balance in both. 'Co-held' ≈ min(balance in A, balance in B) × current price — a rough lower bound on how much capital sits in both names at once."
            insight={crossPoolInsight(crossPoolOverlap, pools)}
          />
          <CrossPoolOverlapList overlap={crossPoolOverlap} pools={pools} limit={10} />
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm text-neutral-400">All pools</h2>
          <Link href="/compare" className="text-xs text-violet-400 hover:text-violet-300">
            compare pools →
          </Link>
        </div>
        <SectionNote
          read="TVL = latest USD. Peak = max in window. 30d% = TVL change vs 30 days ago. APY = 30-day realised yield annualised on 365 basis. Top-10 = % of supply held by the 10 largest accounts."
          insight={poolsTableInsight(pools, histories)}
        />
        <PoolsTable pools={pools} histories={histories} poolHolders={poolHolders} />
      </section>

      <footer className="mt-12 text-xs text-neutral-600">
        Data: Centrifuge V3 GraphQL API (api.centrifuge.io) + Alchemy archive reads for
        Tinlake v2 legacy pools. Window: {startDate} → {endDate}.
        Totals exclude Tinlake v2 and pools with &lt;$100K TVL to match the Centrifuge
        Products page ({formatUsd(latest)} vs their ~$1.99B).
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-900 rounded-md px-4 py-3 bg-neutral-950">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function BreakdownList({ rows }: { rows: { k: string; v: number }[] }) {
  const total = rows.reduce((s, r) => s + r.v, 0) || 1;
  return (
    <div className="space-y-1">
      {rows.map(({ k, v }) => (
        <div key={k} className="flex items-center gap-3 text-sm">
          <div className="w-40 truncate text-neutral-300">{k}</div>
          <div className="flex-1 h-1.5 bg-neutral-900 rounded">
            <div
              className="h-full bg-violet-500 rounded"
              style={{ width: `${(v / total) * 100}%` }}
            />
          </div>
          <div className="w-20 text-right tabular-nums text-neutral-400">
            {v > 0 ? formatUsd(v) : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
