import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import type { RwaDataset } from "@/lib/rwa-types";
import { CATEGORY_LABELS } from "@/lib/rwa-registry";
import { formatUsd } from "@/lib/data";
import { SectionNote } from "@/components/SectionNote";
import { WhaleExposurePanel } from "@/components/WhaleExposurePanel";
import { CounterpartyTable } from "@/components/CounterpartyTable";

export const revalidate = 3600;

async function getRwaData(): Promise<RwaDataset> {
  const path = join(process.cwd(), "public", "data", "rwa.json");
  return JSON.parse(await readFile(path, "utf-8")) as RwaDataset;
}

export default async function RwaPage() {
  const d = await getRwaData();

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/" className="hover:text-violet-400">
          ← Centrifuge
        </Link>
        <span className="mx-2">·</span>
        <span>RWA market</span>
      </nav>

      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tokenized RWA — cross-issuer view</h1>
          <p className="text-sm text-neutral-500 mt-1">
            On-chain snapshot of the main tokenized real-world-asset products across issuers.
          </p>
        </div>
        <div className="text-xs text-neutral-600">
          updated{" "}
          {new Date(d.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Total TVL tracked" value={formatUsd(d.totals.tvl_usd)} />
        <Stat label="Products" value={d.totals.products.toString()} />
        <Stat label="Issuers" value={d.totals.issuers.toString()} />
        <Stat
          label="Top category"
          value={
            Object.entries(d.totals.by_category).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
          }
        />
      </section>

      <section className="mb-10">
        <h2 className="text-sm text-neutral-400 mb-2">Issuer league table</h2>
        <SectionNote
          read="Sum of TVL across every product we track for each issuer. Products column shows how many distinct tokens that issuer has on-chain."
          insight={buildIssuerInsight(d)}
        />
        <div className="border border-neutral-900 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-neutral-400">
              <tr>
                <th className="text-left px-3 py-2 font-normal w-8">#</th>
                <th className="text-left px-3 py-2 font-normal">Issuer</th>
                <th className="text-left px-3 py-2 font-normal">Categories</th>
                <th className="text-right px-3 py-2 font-normal">Products</th>
                <th className="text-right px-3 py-2 font-normal">TVL</th>
                <th className="text-right px-3 py-2 font-normal">Share</th>
              </tr>
            </thead>
            <tbody>
              {d.issuers.map((i, idx) => (
                <tr key={i.slug} className="border-t border-neutral-900">
                  <td className="px-3 py-2 text-neutral-600">{idx + 1}</td>
                  <td className="px-3 py-2">{i.name}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {i.categories
                      .map((c) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS])
                      .join(" · ")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.products}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(i.tvl_usd)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                    {((i.tvl_usd / d.totals.tvl_usd) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm text-neutral-400 mb-2">By category</h2>
        <SectionNote
          read="How on-chain RWA capital is split between asset classes in our registry."
          insight={null}
        />
        <div className="space-y-1">
          {Object.entries(d.totals.by_category)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, tvl]) => (
              <div key={cat} className="flex items-center gap-3 text-sm">
                <div className="w-40 truncate text-neutral-300">
                  {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}
                </div>
                <div className="flex-1 h-1.5 bg-neutral-900 rounded">
                  <div
                    className="h-full bg-violet-500 rounded"
                    style={{ width: `${(tvl / d.totals.tvl_usd) * 100}%` }}
                  />
                </div>
                <div className="w-24 text-right tabular-nums text-neutral-400">
                  {formatUsd(tvl)}
                </div>
                <div className="w-12 text-right tabular-nums text-neutral-600 text-xs">
                  {((tvl / d.totals.tvl_usd) * 100).toFixed(0)}%
                </div>
              </div>
            ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm text-neutral-400 mb-2">Products</h2>
        <SectionNote
          read="Supply = on-chain totalSupply summed across all known EVM deployments + off-chain supply (non-EVM chains like Aptos/Solana/Canton). Price = live NAV (gold spot for commodities, ERC-4626 totalAssets/totalSupply for vaults, last-known otherwise). TVL = supply × price. Δ vs RWA.xyz shows how our calc compares to their published TVL."
          insight={buildProductsInsight(d)}
        />
        <div className="border border-neutral-900 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-neutral-400">
              <tr>
                <th className="text-left px-3 py-2 font-normal">Token</th>
                <th className="text-left px-3 py-2 font-normal">Issuer</th>
                <th className="text-left px-3 py-2 font-normal">Category</th>
                <th className="text-right px-3 py-2 font-normal">Supply</th>
                <th className="text-right px-3 py-2 font-normal">Price</th>
                <th className="text-right px-3 py-2 font-normal">TVL (ours)</th>
                <th className="text-right px-3 py-2 font-normal">RWA.xyz</th>
                <th className="text-right px-3 py-2 font-normal">Δ</th>
              </tr>
            </thead>
            <tbody>
              {d.products.map((p) => (
                <tr key={p.slug} className="border-t border-neutral-900">
                  <td className="px-3 py-2">
                    <a
                      href={`https://etherscan.io/token/${p.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:text-violet-400"
                    >
                      {p.symbol}
                    </a>
                    <div className="text-xs text-neutral-500">{p.name}</div>
                  </td>
                  <td className="px-3 py-2 text-neutral-400">{p.issuer}</td>
                  <td className="px-3 py-2 text-neutral-500 text-xs">
                    {CATEGORY_LABELS[p.category]}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                    {p.supply > 0
                      ? p.supply.toLocaleString("en-US", { maximumFractionDigits: 0 })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                    $
                    {p.price_usd.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(p.tvl_usd)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                    {p.rwaxyz_tvl_usd != null ? formatUsd(p.rwaxyz_tvl_usd) : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      p.tvl_delta_pct == null
                        ? "text-neutral-600"
                        : Math.abs(p.tvl_delta_pct) < 0.05
                          ? "text-emerald-400"
                          : Math.abs(p.tvl_delta_pct) < 0.2
                            ? "text-amber-400"
                            : "text-rose-400"
                    }`}
                  >
                    {p.tvl_delta_pct == null
                      ? "—"
                      : `${p.tvl_delta_pct >= 0 ? "+" : ""}${(p.tvl_delta_pct * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 mb-10">
        <h2 className="text-sm text-neutral-400 mb-2">Anchor allocators across RWA products</h2>
        <SectionNote
          read="Same address holding several RWA products at scale = one institutional allocator deploying capital across multiple wrappers. Share-of-product %  shows how dependent each product is on that one allocator."
          insight="Sky Grove (ex-MakerDAO governance) holds JTRSY 85%, BUIDL 59%, JAAA 6% — a single multisig is the dominant LP across the three flagship tokenized funds. If Sky governance reallocates, all three move together."
        />
        <WhaleExposurePanel totalRwaTvl={d.totals.tvl_usd} />
      </section>

      <section className="mt-10 mb-10">
        <h2 className="text-sm text-neutral-400 mb-2">Counterparty / service provider matrix</h2>
        <SectionNote
          read="Every issuer relies on off-chain counterparties: custodian holds the underlying assets, fund admin computes NAV, auditor verifies, oracle pushes price on-chain, regulator sets the legal frame. Highlighted cells = provider used by multiple issuers (potential single-point-of-failure across the RWA market)."
          insight="Two clusters of counterparty risk: (1) most US-domiciled funds use BNY Mellon or State Street as custodian — concentrated on two banks. (2) WithumSmith audits 3+ issuers (Superstate, Hashnote, Paxos). A single audit failure ripples across multiple products."
        />
        <CounterpartyTable />
      </section>

      <footer className="mt-12 text-xs text-neutral-600 leading-relaxed">
        On-chain supply via Alchemy across {`{ethereum, arbitrum, polygon, optimism, base, avalanche}`}.
        Non-EVM chains (Aptos, Solana, Sui, Canton) tracked via off-chain supply hardcoded from issuer
        reports. Live NAV: gold spot from CoinGecko, ERC-4626 vaults priced via{" "}
        <code>totalAssets / totalSupply</code>, others use last-known. RWA.xyz reference TVL refreshed manually;
        large Δ usually means a chain we don&apos;t cover or a NAV stale in our registry.
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

function buildIssuerInsight(d: RwaDataset): string {
  if (d.issuers.length === 0) return "";
  const top = d.issuers[0];
  const topShare = top.tvl_usd / d.totals.tvl_usd;
  const multiProduct = d.issuers.filter((i) => i.products > 1);
  return `${top.name} leads with ${(topShare * 100).toFixed(0)}% share (${formatUsd(top.tvl_usd)}). ${multiProduct.length} issuer(s) have >1 product — the rest are single-product platforms.`;
}

function buildProductsInsight(d: RwaDataset): string {
  if (d.products.length === 0) return "";
  const top = d.products[0];
  const launchAges = d.products
    .map((p) => {
      if (!p.launched) return null;
      const days = (Date.now() - new Date(p.launched).getTime()) / (1000 * 86_400);
      return { sym: p.symbol, days, tvl: p.tvl_usd };
    })
    .filter((x): x is { sym: string; days: number; tvl: number } => x !== null);
  const avgAge = launchAges.reduce((s, x) => s + x.days, 0) / (launchAges.length || 1);
  return `${top.symbol} largest on Ethereum at ${formatUsd(top.tvl_usd)}. Average product age: ${(avgAge / 365).toFixed(1)} years — category is very young.`;
}
