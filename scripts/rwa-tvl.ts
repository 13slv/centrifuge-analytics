/**
 * Daily snapshot of each RWA product:
 *  - on-chain totalSupply via Alchemy
 *  - price from registry (updated manually for now; Sprint B wires up RWA.xyz)
 *  - TVL = supply × price
 *  - issuer rollup
 *
 * Writes public/data/rwa.json consumed by /rwa page.
 */
import "dotenv/config";
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAbi, formatUnits } from "viem";
import { ethClient, throttle } from "../lib/alchemy.js";
import { RWA_PRODUCTS, ISSUER_META, type RwaCategory } from "../lib/rwa-registry.js";
import type { IssuerRollup, RwaDataset, RwaSnapshot } from "../lib/rwa-types.js";

config({ path: ".env.local", override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "data", "rwa.json");

const ERC20 = parseAbi(["function totalSupply() view returns (uint256)"]);

async function main() {
  const client = ethClient();
  const snapshots: RwaSnapshot[] = [];

  console.log(`\nSnapshotting ${RWA_PRODUCTS.length} RWA products on Ethereum...`);
  for (const p of RWA_PRODUCTS) {
    await throttle();
    try {
      const raw = (await client.readContract({
        address: p.address,
        abi: ERC20,
        functionName: "totalSupply",
      })) as bigint;
      const supply = Number(formatUnits(raw, p.decimals));
      const tvl = supply * p.price_usd;
      snapshots.push({
        slug: p.slug,
        name: p.name,
        symbol: p.symbol,
        issuer: p.issuer,
        issuerSlug: p.issuerSlug,
        category: p.category,
        chain: p.chain,
        address: p.address,
        decimals: p.decimals,
        supply,
        price_usd: p.price_usd,
        tvl_usd: tvl,
        rwaxyz_tvl_usd: null,
        tvl_delta_pct: null,
        notes: p.notes,
        launched: p.launched,
      });
      console.log(
        `  ${p.symbol.padEnd(14)} supply ${supply.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(16)}  × $${p.price_usd.toString().padStart(7)} → TVL $${(tvl / 1e6).toFixed(2)}M`,
      );
    } catch (e) {
      console.log(`  ${p.symbol.padEnd(14)} ERROR: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // Issuer rollup
  const byIssuer = new Map<string, IssuerRollup>();
  for (const s of snapshots) {
    const meta = ISSUER_META[s.issuerSlug];
    const cur = byIssuer.get(s.issuerSlug) ?? {
      slug: s.issuerSlug,
      name: meta?.name ?? s.issuer,
      products: 0,
      tvl_usd: 0,
      categories: [] as RwaCategory[],
    };
    cur.products += 1;
    cur.tvl_usd += s.tvl_usd;
    if (!cur.categories.includes(s.category)) cur.categories.push(s.category);
    byIssuer.set(s.issuerSlug, cur);
  }
  const issuers = Array.from(byIssuer.values()).sort((a, b) => b.tvl_usd - a.tvl_usd);

  const byCategory: Record<string, number> = {};
  for (const s of snapshots) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + s.tvl_usd;
  }

  const dataset: RwaDataset = {
    generatedAt: new Date().toISOString(),
    products: snapshots.sort((a, b) => b.tvl_usd - a.tvl_usd),
    issuers,
    totals: {
      tvl_usd: snapshots.reduce((s, x) => s + x.tvl_usd, 0),
      products: snapshots.length,
      issuers: issuers.length,
      by_category: byCategory,
    },
  };

  await writeFile(OUT, JSON.stringify(dataset, null, 2));

  console.log(`\n=== Issuer League Table ===`);
  for (const [i, iss] of issuers.entries()) {
    console.log(
      `  ${(i + 1).toString().padStart(2)}. ${iss.name.padEnd(28)} ${iss.products}p  $${(iss.tvl_usd / 1e6).toFixed(0)}M`,
    );
  }
  console.log(`\nTotal RWA TVL tracked: $${(dataset.totals.tvl_usd / 1e9).toFixed(2)}B`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
