/**
 * Audit Phase 5 — verify hardcoded values in RWA_PRODUCTS against on-chain reality.
 *
 * Reads each deployment's decimals() and symbol() and compares to registry.
 * Reads launched date from deploy tx (skipped here — Etherscan API needed).
 *
 * Doesn't modify the registry — emits a report. Manual fixes after review.
 */
import "dotenv/config";
import { config } from "dotenv";
import { parseAbi } from "viem";
import { chainClient, throttle } from "../lib/alchemy.js";
import { RWA_PRODUCTS } from "../lib/rwa-registry.js";

config({ path: ".env.local", override: true });

const ERC20_META = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);

type Issue = {
  severity: "ERROR" | "WARN" | "INFO";
  product: string;
  chain: string;
  field: string;
  expected: string | number;
  actual: string | number;
  msg: string;
};

const issues: Issue[] = [];

async function verifyDeployment(
  productSlug: string,
  productSymbol: string,
  dep: { chain: string; address: string; decimals: number },
  retries = 3,
) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const c = chainClient(dep.chain as Parameters<typeof chainClient>[0]);
      await throttle();
      const [decimals, symbol] = await Promise.all([
        c.readContract({
          address: dep.address as `0x${string}`,
          abi: ERC20_META,
          functionName: "decimals",
        }),
        c.readContract({
          address: dep.address as `0x${string}`,
          abi: ERC20_META,
          functionName: "symbol",
        }).catch(() => "??"),
      ]);
      return await processResult(productSlug, productSymbol, dep, decimals, symbol);
    } catch (e) {
      if (attempt === retries - 1) {
        issues.push({
          severity: "WARN",
          product: productSlug,
          chain: dep.chain,
          field: "rpc",
          expected: "ok",
          actual: "fail",
          msg: `RPC error on ${dep.chain} after ${retries} retries: ${(e as Error).message.slice(0, 60)}`,
        });
        return null;
      }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

async function processResult(
  productSlug: string,
  productSymbol: string,
  dep: { chain: string; address: string; decimals: number },
  decimals: unknown,
  symbol: unknown,
) {
  {
    const onChainDec = Number(decimals);
    if (onChainDec !== dep.decimals) {
      issues.push({
        severity: "ERROR",
        product: productSlug,
        chain: dep.chain,
        field: "decimals",
        expected: dep.decimals,
        actual: onChainDec,
        msg: `decimals mismatch on ${dep.chain}: registry says ${dep.decimals}, contract returns ${onChainDec}`,
      });
    }
    const onChainSym = String(symbol);
    if (onChainSym.toLowerCase() !== productSymbol.toLowerCase() && !onChainSym.includes(productSymbol)) {
      issues.push({
        severity: "WARN",
        product: productSlug,
        chain: dep.chain,
        field: "symbol",
        expected: productSymbol,
        actual: onChainSym,
        msg: `symbol mismatch on ${dep.chain}: registry says ${productSymbol}, contract returns ${onChainSym}`,
      });
    }
    return { decimals: onChainDec, symbol: onChainSym };
  }
}

async function main() {
  console.log("=== Phase 5 — curated registry verification ===\n");

  for (const p of RWA_PRODUCTS) {
    console.log(`${p.symbol} (${p.deployments.length} deployment${p.deployments.length > 1 ? "s" : ""}):`);
    for (const dep of p.deployments) {
      const result = await verifyDeployment(p.slug, p.symbol, dep);
      if (result) {
        console.log(
          `  ${dep.chain.padEnd(10)} ${dep.address.slice(0, 10)}…${dep.address.slice(-6)}  decimals=${result.decimals}  symbol=${result.symbol}`,
        );
      }
    }

    // Sanity: rwaxyz_tvl_usd has a freshness flag?
    if (p.rwaxyz_tvl_usd != null && p.rwaxyz_as_of) {
      const ageDays = (Date.now() - new Date(p.rwaxyz_as_of).getTime()) / 86_400_000;
      if (ageDays > 30) {
        issues.push({
          severity: "WARN",
          product: p.slug,
          chain: "n/a",
          field: "rwaxyz_as_of",
          expected: "<30d",
          actual: `${ageDays.toFixed(0)}d`,
          msg: `RWA.xyz reference TVL stale (${ageDays.toFixed(0)} days old)`,
        });
      }
    } else if (p.rwaxyz_tvl_usd != null) {
      issues.push({
        severity: "INFO",
        product: p.slug,
        chain: "n/a",
        field: "rwaxyz_as_of",
        expected: "set",
        actual: "missing",
        msg: "RWA.xyz reference has no as_of timestamp",
      });
    }
  }

  console.log(`\n=== ${issues.length} issue(s) found ===\n`);
  const byLevel: Record<string, Issue[]> = { ERROR: [], WARN: [], INFO: [] };
  for (const i of issues) byLevel[i.severity].push(i);
  for (const [level, list] of Object.entries(byLevel)) {
    if (list.length === 0) continue;
    console.log(`${level} (${list.length}):`);
    for (const i of list) {
      console.log(`  [${i.product}] ${i.msg}`);
    }
    console.log();
  }

  if (byLevel.ERROR.length > 0) {
    console.log("Has ERROR-level issues — manual fix needed.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
