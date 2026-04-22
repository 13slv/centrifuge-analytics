import Link from "next/link";
import { notFound } from "next/navigation";
import { getDataset } from "@/lib/data.server";
import { formatUsd, peakTvl, currentTvl } from "@/lib/data";
import { TvlChart } from "@/components/TvlChart";

export const revalidate = 3600;

export default async function PoolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const poolId = decodeURIComponent(id);
  const { pools, histories } = await getDataset();
  const pool = pools.find((p) => p.id === poolId);
  if (!pool) notFound();
  const history = histories.find((h) => h.poolId === pool.id);
  const series = history?.series ?? [];
  const current = currentTvl(series);
  const peak = peakTvl(series);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/" className="hover:text-violet-400">
          ← overview
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">{pool.name}</h1>
          <span className="text-xs text-neutral-500 uppercase">
            {pool.version === "cfg_v3" ? "V3" : "Tinlake v2"}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              pool.status === "active"
                ? "bg-emerald-950 text-emerald-400"
                : "bg-neutral-900 text-neutral-500"
            }`}
          >
            {pool.status}
          </span>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          {pool.issuer ? `${pool.issuer} · ` : ""}
          {pool.assetClass} · {pool.chain} · {pool.currency}
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Stat label="Current TVL" value={current > 0 ? formatUsd(current) : "—"} />
        <Stat label="Peak TVL" value={peak > 0 ? formatUsd(peak) : "—"} />
        <Stat label="Tranches" value={pool.tranches.length.toString()} />
      </section>

      <section className="mb-8">
        <h2 className="text-sm text-neutral-400 mb-3">TVL since inception of data</h2>
        <TvlChart data={series} height={340} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-sm text-neutral-400 mb-3">Tranches</h2>
          <div className="space-y-2 text-sm">
            {pool.tranches.map((t) => (
              <div
                key={t.id}
                className="flex justify-between border border-neutral-900 rounded px-3 py-2"
              >
                <div>
                  <div className="font-medium">{t.symbol}</div>
                  <div className="text-xs text-neutral-500">{t.seniority}</div>
                </div>
                {t.address && (
                  <a
                    href={`https://etherscan.io/address/${t.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-neutral-500 hover:text-violet-400 font-mono"
                  >
                    {t.address.slice(0, 6)}…{t.address.slice(-4)}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm text-neutral-400 mb-3">Details</h2>
          <dl className="text-sm space-y-2">
            {pool.rootAddress && (
              <Detail
                k="Root"
                v={
                  <a
                    href={`https://etherscan.io/address/${pool.rootAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono hover:text-violet-400"
                  >
                    {pool.rootAddress.slice(0, 6)}…{pool.rootAddress.slice(-4)}
                  </a>
                }
              />
            )}
            {pool.createdAt && (
              <Detail k="Created" v={pool.createdAt.slice(0, 10)} />
            )}
            {pool.metadataUri && (
              <Detail
                k="Metadata"
                v={
                  <a
                    href={pool.metadataUri.replace(
                      "ipfs://",
                      "https://centrifuge.mypinata.cloud/ipfs/",
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs hover:text-violet-400"
                  >
                    {pool.metadataUri.slice(0, 40)}…
                  </a>
                }
              />
            )}
          </dl>
        </div>
      </section>

      {pool.description && (
        <section className="mb-8">
          <h2 className="text-sm text-neutral-400 mb-3">About</h2>
          <p className="text-sm text-neutral-300 leading-relaxed">{pool.description}</p>
        </section>
      )}
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

function Detail({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-500">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

export async function generateStaticParams() {
  const { pools } = await getDataset();
  return pools.map((p) => ({ id: p.id }));
}
