import Link from "next/link";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { RWA_PRODUCTS, ISSUER_META, CATEGORY_LABELS } from "@/lib/rwa-registry";
import { COUNTERPARTY } from "@/lib/rwa-counterparty";
import { whaleExposureByProduct } from "@/lib/rwa-whales";
import { formatUsd } from "@/lib/data";
import { SectionNote } from "@/components/SectionNote";
import type { RwaDataset } from "@/lib/rwa-types";

export const revalidate = 3600;

export async function generateStaticParams() {
  return RWA_PRODUCTS.map((p) => ({ slug: p.slug }));
}

async function getRwaData(): Promise<RwaDataset> {
  const path = join(process.cwd(), "public", "data", "rwa.json");
  return JSON.parse(await readFile(path, "utf-8")) as RwaDataset;
}

export default async function RwaProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = RWA_PRODUCTS.find((p) => p.slug === slug);
  if (!product) notFound();
  const d = await getRwaData();
  const snap = d.products.find((p) => p.slug === slug);
  const issuerMeta = ISSUER_META[product.issuerSlug];
  const cp = COUNTERPARTY[product.issuerSlug];
  const whaleExp = whaleExposureByProduct().get(slug) ?? [];

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/" className="hover:text-violet-400">
          ← Centrifuge
        </Link>
        <span className="mx-2">·</span>
        <Link href="/rwa" className="hover:text-violet-400">
          RWA market
        </Link>
        <span className="mx-2">·</span>
        <span>{product.symbol}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">{product.symbol}</h1>
          <span className="text-xs text-neutral-500 uppercase">
            {CATEGORY_LABELS[product.category]}
          </span>
        </div>
        <p className="text-sm text-neutral-500 mt-1">{product.name}</p>
        <p className="text-xs text-neutral-600 mt-1">
          {product.issuer}
          {issuerMeta?.website && (
            <>
              {" · "}
              <a
                href={issuerMeta.website}
                target="_blank"
                rel="noreferrer"
                className="hover:text-violet-400"
              >
                {issuerMeta.website.replace("https://", "")}
              </a>
            </>
          )}
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="TVL (ours)" value={snap ? formatUsd(snap.tvl_usd) : "—"} />
        <Stat
          label="RWA.xyz reference"
          value={
            product.rwaxyz_tvl_usd != null ? formatUsd(product.rwaxyz_tvl_usd) : "—"
          }
        />
        <Stat
          label="Δ vs RWA.xyz"
          value={
            snap?.tvl_delta_pct != null
              ? `${snap.tvl_delta_pct >= 0 ? "+" : ""}${(snap.tvl_delta_pct * 100).toFixed(0)}%`
              : "—"
          }
        />
        <Stat label="NAV / share" value={`$${snap?.price_usd.toFixed(4) ?? "—"}`} />
      </section>

      {/* Layer 1: Technical */}
      <Section
        title="1. Technical"
        note="On-chain architecture: deployments, decimals, price source."
      >
        <DataGrid>
          <DataRow k="Category" v={CATEGORY_LABELS[product.category]} />
          <DataRow
            k="Price source"
            v={
              product.priceSource.kind === "static"
                ? "Last known NAV (refreshed manually)"
                : product.priceSource.kind === "erc4626"
                  ? "ERC-4626 totalAssets / totalSupply (live)"
                  : "Gold spot from CoinGecko (live)"
            }
          />
          <DataRow
            k="Deployments"
            v={
              <ul className="text-xs space-y-1">
                {product.deployments.map((dep) => (
                  <li key={dep.chain}>
                    <span className="text-neutral-400">{dep.chain}:</span>{" "}
                    <a
                      href={`https://${dep.chain === "ethereum" ? "" : `${dep.chain}.`}etherscan.io/address/${dep.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono hover:text-violet-400"
                    >
                      {dep.address.slice(0, 8)}…{dep.address.slice(-6)}
                    </a>{" "}
                    <span className="text-neutral-500">({dep.decimals} dec)</span>
                  </li>
                ))}
                {product.off_chain_supply && product.off_chain_supply > 0 && (
                  <li className="text-neutral-500">
                    Off-chain (non-EVM): ~
                    {product.off_chain_supply.toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })}{" "}
                    units
                  </li>
                )}
              </ul>
            }
          />
        </DataGrid>
      </Section>

      {/* Layer 2: Legal */}
      <Section
        title="2. Legal"
        note="Jurisdiction, regulator, fund wrapper. Determines who can invest and where the assets sit."
      >
        <DataGrid>
          <DataRow k="Jurisdiction" v={cp?.jurisdiction ?? "—"} />
          <DataRow k="Regulator" v={cp?.regulator ?? "—"} />
          <DataRow k="Fund admin" v={cp?.fund_admin ?? "—"} />
          <DataRow k="Auditor" v={cp?.auditor ?? "—"} />
        </DataGrid>
      </Section>

      {/* Layer 3: Economic */}
      <Section
        title="3. Economic"
        note="Fees, NAV mechanics, redemption terms, target yield. The investor-side P&L."
      >
        <DataGrid>
          <DataRow k="Launched" v={product.launched ?? "—"} />
          <DataRow k="Notes" v={product.notes ?? "—"} />
        </DataGrid>
      </Section>

      {/* Layer 4: Distribution */}
      <Section
        title="4. Distribution"
        note="Who buys this product. Concentration tells you about resilience to a single redemption."
      >
        {whaleExp.length === 0 ? (
          <div className="text-sm text-neutral-500">
            No tracked anchor wallet currently registered for this product. (Coverage will expand
            as more allocators are mapped.)
          </div>
        ) : (
          <div className="border border-neutral-900 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-950 text-neutral-400 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-normal">Anchor</th>
                  <th className="text-left px-3 py-2 font-normal">Org</th>
                  <th className="text-right px-3 py-2 font-normal">Holding</th>
                  <th className="text-right px-3 py-2 font-normal">% of product</th>
                </tr>
              </thead>
              <tbody>
                {whaleExp.map(({ whale, holding }) => (
                  <tr key={whale.address} className="border-t border-neutral-900">
                    <td className="px-3 py-2">
                      <a
                        href={`https://etherscan.io/address/${whale.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-violet-400"
                      >
                        {whale.label}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-neutral-400">{whale.org}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatUsd(holding.amount_usd)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        holding.share_of_product >= 0.5
                          ? "text-rose-400"
                          : holding.share_of_product >= 0.2
                            ? "text-amber-400"
                            : "text-neutral-400"
                      }`}
                    >
                      {(holding.share_of_product * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Layer 5: Risk */}
      <Section
        title="5. Risk"
        note="Counterparty stack, oracle, single-point-of-failure analysis."
      >
        <DataGrid>
          <DataRow k="Custodian" v={cp?.custodian ?? "—"} />
          <DataRow k="Prime broker" v={cp?.prime_broker ?? "—"} />
          <DataRow k="Transfer agent" v={cp?.transfer_agent ?? "—"} />
          <DataRow k="Oracle / NAV feed" v={cp?.oracle ?? "—"} />
          <DataRow k="Legal counsel" v={cp?.legal_counsel ?? "—"} />
        </DataGrid>
        {whaleExp.length > 0 && (
          <div className="mt-3 text-xs text-neutral-500">
            <SectionNote
              read=""
              insight={`${whaleExp.length === 1 ? "One anchor" : `${whaleExp.length} anchors`} controls ${(whaleExp.reduce((s, w) => s + w.holding.share_of_product, 0) * 100).toFixed(0)}% of supply. ${whaleExp.some((w) => w.holding.share_of_product >= 0.5) ? "Single-point-of-LP risk: a governance vote at the anchor allocator can halve TVL overnight." : "Concentration is moderate — no single LP dominates."}`}
            />
          </div>
        )}
      </Section>
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

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-sm text-neutral-400 mb-2">{title}</h2>
      <p className="text-xs text-neutral-600 mb-3">{note}</p>
      {children}
    </section>
  );
}

function DataGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="border border-neutral-900 rounded-md divide-y divide-neutral-900">
      {children}
    </dl>
  );
}

function DataRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-baseline px-3 py-2 text-sm">
      <dt className="text-xs text-neutral-500 md:w-44 mb-1 md:mb-0">{k}</dt>
      <dd className="text-neutral-200 flex-1">{v}</dd>
    </div>
  );
}
