import Link from "next/link";
import { getDataset } from "@/lib/data.server";
import { formatUsd, totalTvlByDate, currentTvl } from "@/lib/data";
import { TvlChart } from "@/components/TvlChart";
import { PoolsTable } from "@/components/PoolsTable";
import { AssetClassDrift } from "@/components/AssetClassDrift";
import { CrossPoolOverlapList } from "@/components/CrossPoolOverlap";
import { AlertsPanel } from "@/components/AlertsPanel";

export const revalidate = 3600;

export default async function HomePage() {
  const { pools, histories, generatedAt, startDate, endDate, crossPoolOverlap, poolHolders, poolFlows } =
    await getDataset();
  const histMap = new Map(histories.map((h) => [h.poolId, h]));
  const total = totalTvlByDate(pools, histories);
  const latest = total[total.length - 1]?.tvl_usd ?? 0;
  const peak = total.reduce((m, p) => Math.max(m, p.tvl_usd), 0);

  // Asset class rollup @ latest
  const byClass = new Map<string, number>();
  const byChain = new Map<string, number>();
  for (const p of pools) {
    const h = histMap.get(p.id);
    const tvl = currentTvl(h?.series ?? []);
    byClass.set(p.assetClass, (byClass.get(p.assetClass) ?? 0) + tvl);
    byChain.set(p.chain, (byChain.get(p.chain) ?? 0) + tvl);
  }
  const classRows = Array.from(byClass.entries())
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 10);
  const chainRows = Array.from(byChain.entries())
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Centrifuge Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">
            On-chain TVL across every tokenized asset on Centrifuge, {startDate} → {endDate}.
          </p>
        </div>
        <div className="text-xs text-neutral-600">
          updated {new Date(generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Stat label="Current TVL" value={formatUsd(latest)} />
        <Stat label="Peak TVL (since Jan 2025)" value={formatUsd(peak)} />
        <Stat label="Active pools" value={pools.filter((p) => p.status === "active").length.toString()} />
      </section>

      <section className="mb-10">
        <h2 className="text-sm text-neutral-400 mb-3">Total TVL — all Centrifuge pools</h2>
        <TvlChart data={total} height={320} />
      </section>

      <section className="mb-10">
        <h2 className="text-sm text-neutral-400 mb-3">Recent notable activity (last 14 days)</h2>
        <AlertsPanel
          pools={pools}
          histories={histories}
          poolFlows={poolFlows}
          poolHolders={poolHolders}
        />
      </section>

      <section className="mb-10">
        <h2 className="text-sm text-neutral-400 mb-3">
          Asset-class market-share drift (stacked, % of total TVL)
        </h2>
        <AssetClassDrift pools={pools} histories={histories} mode="share" />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div>
          <h2 className="text-sm text-neutral-400 mb-3">TVL by asset class</h2>
          <BreakdownList rows={classRows} />
        </div>
        <div>
          <h2 className="text-sm text-neutral-400 mb-3">TVL by chain</h2>
          <BreakdownList rows={chainRows} />
        </div>
      </section>

      {crossPoolOverlap && crossPoolOverlap.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm text-neutral-400 mb-3">
            Cross-pool investor overlap — where the same whales appear
          </h2>
          <CrossPoolOverlapList overlap={crossPoolOverlap} pools={pools} limit={10} />
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm text-neutral-400">All pools</h2>
          <Link href="/compare" className="text-xs text-violet-400 hover:text-violet-300">
            compare pools →
          </Link>
        </div>
        <PoolsTable pools={pools} histories={histories} poolHolders={poolHolders} />
      </section>

      <footer className="mt-12 text-xs text-neutral-600">
        Data: Centrifuge V3 GraphQL API + Alchemy archive reads for Tinlake v2. Source
        addresses from centrifuge/tinlake-pools-mainnet and centrifuge/protocol-v3.
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
