/**
 * Refresh whale holdings on-chain. Reads balanceOf(whaleAddress) for every
 * (whale, product) pair across all known deployments, multiplies by current
 * price from rwa.json, writes public/data/whales-live.json.
 *
 * Failures are non-fatal — we keep last-known value for that holding.
 */
import "dotenv/config";
import { config } from "dotenv";
import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAbi, formatUnits } from "viem";
import { chainClient, throttle } from "../lib/alchemy.js";
import { RWA_PRODUCTS } from "../lib/rwa-registry.js";
import { WHALES } from "../lib/rwa-whales.js";
import type { RwaDataset } from "../lib/rwa-types.js";

config({ path: ".env.local", override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const RWA_PATH = join(__dirname, "..", "public", "data", "rwa.json");
const OUT = join(__dirname, "..", "public", "data", "whales-live.json");

const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

async function main() {
  // Pull latest product TVLs / prices from rwa.json so we know how to value things.
  const rwa = JSON.parse(await readFile(RWA_PATH, "utf-8")) as RwaDataset;
  const productMap = new Map(rwa.products.map((p) => [p.slug, p]));
  const registryMap = new Map(RWA_PRODUCTS.map((p) => [p.slug, p]));

  console.log(`Refreshing balances for ${WHALES.length} whale(s)...`);

  const results: Array<{
    address: string;
    label: string;
    org: string;
    controller: string;
    notes?: string;
    holdings: Array<{
      product_slug: string;
      product_symbol: string;
      amount_usd: number;
      raw_balance: string;
      share_of_product: number;
      source: string;
      refreshed_at: string;
    }>;
  }> = [];

  for (const whale of WHALES) {
    console.log(`\n${whale.label} (${whale.address})`);
    const refreshed: typeof results[number]["holdings"] = [];
    for (const decl of whale.holdings) {
      const product = registryMap.get(decl.product_slug);
      const tvlEntry = productMap.get(decl.product_slug);
      if (!product || !tvlEntry) {
        // Centrifuge JTRSY/JAAA — keep declared holdings as-is (read via Centrifuge graphql, not Alchemy)
        refreshed.push({
          product_slug: decl.product_slug,
          product_symbol: decl.product_slug.toUpperCase(),
          amount_usd: decl.amount_usd,
          raw_balance: "n/a",
          share_of_product: decl.share_of_product,
          source: decl.source,
          refreshed_at: new Date().toISOString(),
        });
        console.log(`  ${decl.product_slug.toUpperCase().padEnd(14)} skipped (off-Eth source)`);
        continue;
      }
      let balance = 0;
      let raw = "0";
      let foundOnChain = false;
      for (const dep of product.deployments) {
        try {
          const c = chainClient(dep.chain);
          await throttle();
          const b = (await c.readContract({
            address: dep.address,
            abi: ERC20,
            functionName: "balanceOf",
            args: [whale.address as `0x${string}`],
          })) as bigint;
          if (b > 0n) {
            balance += Number(formatUnits(b, dep.decimals));
            raw = b.toString();
            foundOnChain = true;
          }
        } catch (e) {
          // try next deployment
        }
      }
      const amountUsd = balance * tvlEntry.price_usd;
      const share = tvlEntry.tvl_usd > 0 ? amountUsd / tvlEntry.tvl_usd : 0;
      if (foundOnChain) {
        refreshed.push({
          product_slug: decl.product_slug,
          product_symbol: tvlEntry.symbol,
          amount_usd: amountUsd,
          raw_balance: raw,
          share_of_product: share,
          source: "on-chain balanceOf",
          refreshed_at: new Date().toISOString(),
        });
        console.log(
          `  ${tvlEntry.symbol.padEnd(14)} \$${(amountUsd / 1e6).toFixed(1)}M  (${(share * 100).toFixed(1)}% of \$${(tvlEntry.tvl_usd / 1e6).toFixed(0)}M)`,
        );
      } else {
        // Keep declared value as fallback
        refreshed.push({
          product_slug: decl.product_slug,
          product_symbol: tvlEntry.symbol,
          amount_usd: decl.amount_usd,
          raw_balance: "0",
          share_of_product: decl.share_of_product,
          source: `${decl.source} (on-chain returned 0)`,
          refreshed_at: new Date().toISOString(),
        });
        console.log(`  ${tvlEntry.symbol.padEnd(14)} on-chain 0, kept declared \$${(decl.amount_usd / 1e6).toFixed(1)}M`);
      }
    }
    results.push({
      address: whale.address,
      label: whale.label,
      org: whale.org,
      controller: whale.controller,
      notes: whale.notes,
      holdings: refreshed.sort((a, b) => b.amount_usd - a.amount_usd),
    });
  }

  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), whales: results }, null, 2));
  const total = results.reduce(
    (s, w) => s + w.holdings.reduce((x, h) => x + h.amount_usd, 0),
    0,
  );
  console.log(`\nTotal anchor capital: \$${(total / 1e9).toFixed(2)}B`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
