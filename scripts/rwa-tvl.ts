/**
 * Daily multi-chain RWA snapshot:
 *  - on-chain totalSupply summed across deployments via Alchemy
 *  - live NAV: gold spot for commodities, ERC-4626 totalAssets for vaults
 *  - cross-check vs RWA.xyz reference TVL stored in registry
 *  - merges Centrifuge JTRSY/JAAA from existing dataset.json
 *  - issuer rollup
 *
 * Writes public/data/rwa.json.
 */
import "dotenv/config";
import { config } from "dotenv";
import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAbi, formatUnits } from "viem";
import { chainClient, throttle } from "../lib/alchemy.js";
import {
  RWA_PRODUCTS,
  ISSUER_META,
  type RwaCategory,
  type RwaProduct,
} from "../lib/rwa-registry.js";
import type { IssuerRollup, RwaDataset, RwaSnapshot } from "../lib/rwa-types.js";

config({ path: ".env.local", override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "data", "rwa.json");
const CFG_DATASET = join(__dirname, "..", "public", "data", "dataset.json");

const ERC20 = parseAbi(["function totalSupply() view returns (uint256)"]);
const ERC4626 = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
]);

async function fetchGoldSpot(): Promise<number> {
  // CoinGecko gold (XAU) — free, no key
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd",
      { signal: AbortSignal.timeout(15_000) },
    );
    const json = (await res.json()) as { "pax-gold"?: { usd?: number } };
    const v = json["pax-gold"]?.usd;
    if (typeof v === "number" && v > 1000 && v < 10000) return v;
  } catch {
    // fall through
  }
  return 4000; // fallback
}

async function resolvePrice(p: RwaProduct, goldSpot: number): Promise<number> {
  if (p.priceSource.kind === "gold-spot") return goldSpot;
  if (p.priceSource.kind === "erc4626") {
    try {
      const c = chainClient(p.priceSource.chain);
      await throttle();
      const [totalAssets, totalSupply] = (await Promise.all([
        c.readContract({
          address: p.priceSource.address,
          abi: ERC4626,
          functionName: "totalAssets",
        }),
        c.readContract({
          address: p.priceSource.address,
          abi: ERC4626,
          functionName: "totalSupply",
        }),
      ])) as [bigint, bigint];
      if (totalSupply === 0n) return p.price_usd;
      const shareDec = p.deployments[0].decimals;
      const ta = Number(formatUnits(totalAssets, p.priceSource.assetDecimals));
      const ts = Number(formatUnits(totalSupply, shareDec));
      return ts > 0 ? ta / ts : p.price_usd;
    } catch {
      return p.price_usd;
    }
  }
  return p.price_usd;
}

async function chainSupply(
  chain: ReturnType<typeof chainClient> extends infer T ? T : never,
  address: `0x${string}`,
  decimals: number,
): Promise<number> {
  await throttle();
  const raw = (await chain.readContract({
    address,
    abi: ERC20,
    functionName: "totalSupply",
  })) as bigint;
  return Number(formatUnits(raw, decimals));
}

async function snapshotProduct(p: RwaProduct, goldSpot: number): Promise<RwaSnapshot | null> {
  let onchainSupply = 0;
  const chainBreakdown: Record<string, number> = {};
  for (const dep of p.deployments) {
    try {
      const client = chainClient(dep.chain);
      const sup = await chainSupply(client, dep.address, dep.decimals);
      onchainSupply += sup;
      chainBreakdown[dep.chain] = sup;
    } catch (e) {
      console.log(`    [warn] ${p.symbol}@${dep.chain}: ${(e as Error).message.slice(0, 60)}`);
      chainBreakdown[dep.chain] = 0;
    }
  }
  const offchain = p.off_chain_supply ?? 0;
  const totalSupply = onchainSupply + offchain;
  const price = await resolvePrice(p, goldSpot);
  const tvl = totalSupply * price;
  const rwax = p.rwaxyz_tvl_usd;
  const delta = rwax != null && rwax > 0 ? (tvl - rwax) / rwax : null;
  return {
    slug: p.slug,
    name: p.name,
    symbol: p.symbol,
    issuer: p.issuer,
    issuerSlug: p.issuerSlug,
    category: p.category,
    chain: p.deployments.map((d) => d.chain).join("+") + (offchain > 0 ? "+other" : ""),
    address: p.deployments[0].address,
    decimals: p.deployments[0].decimals,
    supply: totalSupply,
    price_usd: price,
    tvl_usd: tvl,
    rwaxyz_tvl_usd: rwax,
    tvl_delta_pct: delta,
    notes: p.notes,
    launched: p.launched,
  };
}

async function loadCentrifugeForRwa(): Promise<RwaSnapshot[]> {
  // Pull JTRSY and JAAA from the Centrifuge dataset and reformat as RwaSnapshot.
  try {
    const ds = JSON.parse(await readFile(CFG_DATASET, "utf-8")) as {
      pools: Array<{ id: string; name?: string; assetClass?: string }>;
      histories: Array<{
        poolId: string;
        series?: Array<{ date: string; tvl_usd: number }>;
        apySeries?: Array<{ date: string; apy: number }>;
      }>;
    };
    const wanted = new Set(["281474976710662", "281474976710663"]); // JTRSY, JAAA main pools
    const out: RwaSnapshot[] = [];
    for (const p of ds.pools) {
      if (!wanted.has(p.id)) continue;
      const h = ds.histories.find((x) => x.poolId === p.id);
      const series = h?.series ?? [];
      const tvl = series[series.length - 1]?.tvl_usd ?? 0;
      const sym = p.id === "281474976710662" ? "JTRSY" : "JAAA";
      const cat: RwaCategory = sym === "JTRSY" ? "t_bill" : "credit";
      out.push({
        slug: sym.toLowerCase(),
        name: p.name ?? sym,
        symbol: sym,
        issuer: "Centrifuge / Anemoy",
        issuerSlug: "centrifuge",
        category: cat,
        chain: "centrifuge-v3",
        address: "0x" + p.id,
        decimals: 6,
        supply: 0, // not directly comparable
        price_usd: 1.0,
        tvl_usd: tvl,
        rwaxyz_tvl_usd: sym === "JTRSY" ? 1_519_000_000 : 403_000_000,
        tvl_delta_pct: null,
        notes: "Sourced from Centrifuge V3 graphql; see /pools/" + p.id,
        launched: "2025-07-18",
      });
    }
    return out;
  } catch (e) {
    console.log(`  [warn] Centrifuge merge skipped: ${(e as Error).message}`);
    return [];
  }
}

async function main() {
  console.log("Fetching gold spot price...");
  const gold = await fetchGoldSpot();
  console.log(`  Gold: $${gold}/oz\n`);

  const snapshots: RwaSnapshot[] = [];
  for (const p of RWA_PRODUCTS) {
    process.stdout.write(`  ${p.symbol.padEnd(14)} `);
    const snap = await snapshotProduct(p, gold);
    if (snap) {
      snapshots.push(snap);
      const deltaStr =
        snap.tvl_delta_pct != null
          ? ` (RWA.xyz $${(snap.rwaxyz_tvl_usd! / 1e6).toFixed(0)}M, Δ ${(snap.tvl_delta_pct * 100).toFixed(0)}%)`
          : "";
      console.log(
        `supply ${snap.supply.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(15)} × $${snap.price_usd.toFixed(2).padStart(8)} = TVL $${(snap.tvl_usd / 1e6).toFixed(0)}M${deltaStr}`,
      );
    }
  }

  console.log("\nMerging Centrifuge JTRSY/JAAA from main dataset...");
  const cfg = await loadCentrifugeForRwa();
  for (const c of cfg) {
    snapshots.push(c);
    console.log(`  ${c.symbol.padEnd(14)} TVL $${(c.tvl_usd / 1e6).toFixed(0)}M (Centrifuge)`);
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
  console.log(`\nTotal RWA TVL: $${(dataset.totals.tvl_usd / 1e9).toFixed(2)}B`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
