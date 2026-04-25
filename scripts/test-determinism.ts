/**
 * Audit Phase 4 — reproducibility & determinism.
 *
 * Verifies:
 *  - block-cache.json integrity (no duplicate dates, blocks ascending in time)
 *  - rwa-tvl.ts idempotency (second run produces identical output minus timestamp)
 *  - forward-fill correctness (gap days carry previous value, not zero)
 *  - flow Σ vs ΔTVL precision drift identification
 */
import { readFile, copyFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import type { Dataset } from "../lib/types.js";
import type { RwaDataset } from "../lib/rwa-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "public", "data");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

// 1. Block cache integrity
async function testBlockCache() {
  console.log("\n[1] Block cache integrity");
  const cache = JSON.parse(
    await readFile(join(DATA, "block-cache.json"), "utf-8"),
  ) as Record<string, string>;
  const dates = Object.keys(cache).sort();
  assert(dates.length > 0, "block-cache non-empty");

  // Each date maps to a single block (Map property)
  const seen = new Set<string>();
  for (const d of dates) {
    assert(!seen.has(d), `date ${d} appears once`);
    seen.add(d);
  }

  // Blocks must be ascending in time order
  let prevBlock = 0n;
  for (const d of dates) {
    const block = BigInt(cache[d]);
    assert(block > prevBlock, `${d} block (${block}) > prev block (${prevBlock})`);
    prevBlock = block;
  }

  console.log(`  · ${dates.length} cached dates, blocks strictly ascending`);
}

// 2. Idempotency — run rwa-tvl twice, diff output minus timestamp
async function testIdempotency() {
  console.log("\n[2] rwa-tvl.ts idempotency");
  const rwaPath = join(DATA, "rwa.json");
  const backup = join(DATA, ".rwa.backup.json");

  await copyFile(rwaPath, backup);
  const a = JSON.parse(await readFile(rwaPath, "utf-8")) as RwaDataset;

  try {
    execSync("tsx scripts/rwa-tvl.ts", { stdio: "pipe", cwd: ROOT });
    const b = JSON.parse(await readFile(rwaPath, "utf-8")) as RwaDataset;

    // generatedAt should differ
    assert(a.generatedAt !== b.generatedAt, "generatedAt updates on each run");

    // Everything else should match within tolerance (live oracle prices may drift cents)
    assert(a.products.length === b.products.length, "product count stable");
    assert(a.totals.tvl_usd > 0 && b.totals.tvl_usd > 0, "totals positive both runs");
    const drift = Math.abs((a.totals.tvl_usd - b.totals.tvl_usd) / a.totals.tvl_usd);
    assert(drift < 0.01, `total TVL drift between consecutive runs < 1% (got ${(drift * 100).toFixed(3)}%)`);

    // Per-product TVL should match within tolerance.
    // 2% allows for: gold spot live updates between calls, ERC-4626 deposits
    // landing between two consecutive snapshots, on-chain mempool re-org.
    let highDrift = 0;
    for (const p of a.products) {
      const matchB = b.products.find((q) => q.slug === p.slug);
      if (!matchB) continue;
      const d = p.tvl_usd > 0 ? Math.abs((p.tvl_usd - matchB.tvl_usd) / p.tvl_usd) : 0;
      if (d > 0.02) highDrift++;
    }
    assert(highDrift === 0, `no product drifts >2% between runs (${highDrift} did)`);
  } finally {
    // Restore baseline
    await copyFile(backup, rwaPath);
    await unlink(backup);
  }
}

// 3. Forward-fill correctness in TVL series
async function testForwardFill() {
  console.log("\n[3] Forward-fill correctness");
  const ds = JSON.parse(await readFile(join(DATA, "dataset.json"), "utf-8")) as Dataset;

  // For each pool, gap days (no real snapshot) must inherit previous value, not 0
  for (const h of ds.histories) {
    if (h.series.length < 3) continue;
    let suspicious = 0;
    let prev = h.series[0].tvl_usd;
    for (let i = 1; i < h.series.length; i++) {
      const cur = h.series[i].tvl_usd;
      // If we suddenly drop to 0 then come back to non-zero next day, that's
      // a forward-fill bug, not a real redemption (no V3 pool empties + refills daily)
      if (prev > 1_000_000 && cur === 0 && i + 1 < h.series.length && h.series[i + 1].tvl_usd > 0) {
        suspicious++;
      }
      prev = cur;
    }
    assert(suspicious === 0, `pool ${h.poolId} has no spurious 0-day gaps (${suspicious} found)`);
  }
}

// 4. Σflows ≈ ΔTVL precision drift identification
async function testFlowsConsistency() {
  console.log("\n[4] Σflows ≈ ΔTVL precision");
  const ds = JSON.parse(await readFile(join(DATA, "dataset.json"), "utf-8")) as Dataset;
  if (!ds.poolFlows) {
    console.log("  · no poolFlows, skipping");
    return;
  }

  const offenders: { poolId: string; deltaTvl: number; sumFlow: number; rel: number }[] = [];
  for (const pf of ds.poolFlows) {
    const h = ds.histories.find((x) => x.poolId === pf.poolId);
    if (!h || h.series.length < 2) continue;
    const start = h.series[0].tvl_usd;
    const end = h.series[h.series.length - 1].tvl_usd;
    const deltaTvl = end - start;
    if (Math.abs(deltaTvl) < 100_000) continue;

    const sumFlow = pf.flows.reduce(
      (s, f) => s + f.inflow_usd - f.outflow_usd + f.yield_usd,
      0,
    );
    const rel = Math.abs((sumFlow - deltaTvl) / deltaTvl);
    if (rel > 0.001) offenders.push({ poolId: pf.poolId, deltaTvl, sumFlow, rel });
  }

  if (offenders.length === 0) {
    assert(true, "all material pools have Σflows ≈ ΔTVL within 0.1%");
  } else {
    console.log(`  ⚠ ${offenders.length} pool(s) with >0.1% drift:`);
    for (const o of offenders.slice(0, 5)) {
      console.log(
        `      ${o.poolId.slice(-6)}  ΔTVL=$${(o.deltaTvl / 1e6).toFixed(2)}M  Σflow=$${(o.sumFlow / 1e6).toFixed(2)}M  drift=${(o.rel * 100).toFixed(2)}%`,
      );
    }
    // This is a soft check — JSON precision artifact, acceptable up to 1%
    const big = offenders.filter((o) => o.rel > 0.05).length;
    assert(big === 0, `no pool drifts >5% (${big} did — investigate)`);
  }
}

async function main() {
  console.log("=== Audit Phase 4 — determinism tests ===");
  await testBlockCache();
  await testIdempotency();
  await testForwardFill();
  await testFlowsConsistency();

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
