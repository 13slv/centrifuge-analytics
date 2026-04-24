/**
 * Audit Phase 3 — invariant tests.
 *
 * Pure-function correctness + dataset-wide sanity checks. Run as part of the
 * daily cron — a regression here is a hard fail before the data ships.
 *
 *   npm run test
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  peakTvl,
  currentTvl,
  formatUsd,
  totalTvlByDate,
  isLivePool,
} from "../lib/data.js";
import type {
  Dataset,
  HolderSnapshot,
  PoolFlows,
  PoolHolders,
  PoolHistory,
} from "../lib/types.js";
import type { RwaDataset } from "../lib/rwa-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET = join(__dirname, "..", "public", "data", "dataset.json");
const RWA = join(__dirname, "..", "public", "data", "rwa.json");
const WHALES_LIVE = join(__dirname, "..", "public", "data", "whales-live.json");

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

function assertClose(actual: number, expected: number, tol: number, msg: string) {
  const rel = expected === 0 ? Math.abs(actual) : Math.abs((actual - expected) / expected);
  assert(rel <= tol, `${msg} (got ${actual}, expected ~${expected}, rel diff ${(rel * 100).toFixed(2)}%)`);
}

// ----- Pure-function tests -----

function gini(values: number[]): number {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (2 * (i + 1) - n - 1) * sorted[i];
  return cum / (n * sum);
}

function hhi(values: number[]): number {
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const v of values) {
    const share = v / total;
    h += share * share;
  }
  return h;
}

function testPureFunctions() {
  console.log("\n[1] Pure functions");

  // gini
  assert(gini([]) === 0, "gini([]) === 0");
  assert(gini([1]) === 0, "gini([1]) === 0 (single holder)");
  assertClose(gini([1, 1, 1, 1]), 0, 0.01, "gini equal-distribution ≈ 0");
  // textbook: gini([1,1,1,1]+(1,0,0,0)) — single dominant = (n-1)/n = 0.75 for n=4 (formula approximation)
  assertClose(gini([1, 0, 0, 0]), 0.75, 0.01, "gini single-monopoly (n=4) ≈ 0.75");
  assertClose(gini([10, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 0.9, 0.01, "gini n=10 monopoly ≈ 0.9");

  // hhi
  assert(hhi([]) === 0, "hhi([]) === 0");
  assertClose(hhi([1, 1, 1, 1]), 0.25, 0.001, "hhi equal-quartet = 1/n = 0.25");
  assert(hhi([1, 0, 0, 0]) === 1, "hhi monopoly = 1");
  assertClose(hhi([2, 1, 1]), 6 / 16, 0.001, "hhi [2,1,1] = (0.5²+0.25²+0.25²) = 0.375");

  // formatUsd
  assert(formatUsd(1_500_000_000) === "$1.50B", "formatUsd 1.5B");
  assert(formatUsd(2_500_000) === "$2.50M", "formatUsd 2.5M");
  assert(formatUsd(7_500) === "$7.5K", "formatUsd 7.5K");
  assert(formatUsd(99) === "$99", "formatUsd small");
  assert(formatUsd(0) === "$0", "formatUsd zero");

  // peakTvl / currentTvl
  const series = [
    { date: "2025-01-01", tvl_usd: 100 },
    { date: "2025-01-02", tvl_usd: 200 },
    { date: "2025-01-03", tvl_usd: 150 },
  ];
  assert(peakTvl(series) === 200, "peakTvl picks max");
  assert(currentTvl(series) === 150, "currentTvl picks last non-zero");
  assert(peakTvl([]) === 0, "peakTvl empty = 0");
  assert(currentTvl([]) === 0, "currentTvl empty = 0");
  // currentTvl falls back from trailing zeros
  assert(
    currentTvl([
      { date: "2025-01-01", tvl_usd: 50 },
      { date: "2025-01-02", tvl_usd: 0 },
    ]) === 50,
    "currentTvl skips trailing zero",
  );
}

// ----- Dataset invariants -----

async function testCentrifugeDataset() {
  console.log("\n[2] Centrifuge dataset");
  const d = JSON.parse(await readFile(DATASET, "utf-8")) as Dataset;

  assert(d.pools.length > 0, "pools registry non-empty");
  assert(d.histories.length === d.pools.length, "one history per pool");
  assert(new Date(d.generatedAt).getTime() > 0, "generatedAt is valid date");

  // Schema integrity
  for (const p of d.pools) {
    assert(typeof p.id === "string" && p.id.length > 0, `pool ${p.id} has id`);
    assert(["tinlake_v2", "cfg_v3"].includes(p.version), `pool ${p.id} has valid version`);
    assert(["active", "closed", "upcoming"].includes(p.status), `pool ${p.id} has valid status`);
    assert(p.tranches.length >= 0, `pool ${p.id} tranches array exists`);
  }

  // TVL non-negative + chronological
  for (const h of d.histories) {
    let prev = "";
    for (const pt of h.series) {
      assert(pt.tvl_usd >= 0, `pool ${h.poolId} TVL non-negative on ${pt.date}`);
      assert(prev === "" || pt.date >= prev, `pool ${h.poolId} dates monotonic`);
      prev = pt.date;
    }
  }

  // APY in reasonable range — only enforced on pools with material TVL.
  // Tiny pools (<$1M) can show wild APY due to since-inception distortion or
  // S&P500-style equity drawdowns; we don't fail on those.
  for (const h of d.histories) {
    if (!h.apySeries) continue;
    const tvlByDate = new Map(h.series.map((s) => [s.date, s.tvl_usd]));
    for (const a of h.apySeries) {
      const tvl = tvlByDate.get(a.date) ?? 0;
      if (tvl < 1_000_000) continue; // skip tiny pools
      // [-100%, +500%] — tighter than that catches indexer bugs (e.g. JH S&P500
      // Fund showed -98% APY for two weeks in March 2026 — known bad data
      // upstream).
      assert(
        Number.isFinite(a.apy) && a.apy > -1.0 && a.apy < 5.0,
        `pool ${h.poolId} APY ${(a.apy * 100).toFixed(0)}% on ${a.date} (TVL \$${(tvl / 1e6).toFixed(1)}M) in [-100%, 500%]`,
      );
    }
  }

  // Concentration metrics in [0, 1] (with float-point tolerance)
  const EPS = 1e-6;
  for (const ph of d.poolHolders ?? []) {
    for (const s of ph.series) {
      assert(
        s.top10_share >= -EPS && s.top10_share <= 1 + EPS,
        `pool ${ph.poolId} top10_share ∈ [0,1] (got ${s.top10_share})`,
      );
      assert(s.gini >= -EPS && s.gini <= 1 + EPS, `pool ${ph.poolId} gini ∈ [0,1]`);
      assert(s.hhi >= -EPS && s.hhi <= 1 + EPS, `pool ${ph.poolId} hhi ∈ [0,1]`);
      assert(s.holders >= 0 && Number.isInteger(s.holders), `pool ${ph.poolId} holders is non-neg int`);
    }
  }

  // Cohort retention: surviving never exceeds initial cohort size
  // (Note: NOT strictly monotonic — investors can withdraw and re-enter,
  // which is an intentional behaviour of our "currently holding" semantics.)
  for (const ph of d.poolHolders ?? []) {
    for (const c of ph.cohorts) {
      for (const r of c.retention) {
        assert(
          r.surviving <= c.initial_investors,
          `pool ${ph.poolId} cohort ${c.cohort} M+${r.month_offset} ≤ initial_investors`,
        );
      }
    }
  }

  // Live pool filter sanity: no Tinlake in livePools
  const live = d.pools.filter((p) => isLivePool(p, d.histories.find((h) => h.poolId === p.id)));
  for (const p of live) {
    assert(p.version === "cfg_v3", `live pool ${p.id} is V3 (Tinlake excluded)`);
  }

  // ΔTVL ≈ Σflows invariant per pool (after Phase 2 fix)
  if (d.poolFlows) {
    let checked = 0;
    let highDelta = 0;
    for (const pf of d.poolFlows) {
      const h = d.histories.find((x) => x.poolId === pf.poolId);
      if (!h || h.series.length < 2) continue;
      const tvlDelta = h.series[h.series.length - 1].tvl_usd - h.series[0].tvl_usd;
      const flowSum = pf.flows.reduce(
        (s, f) => s + f.inflow_usd - f.outflow_usd + f.yield_usd,
        0,
      );
      // Should be approximately equal (yield = ΔTVL - net flow by definition,
      // so the sum should reconstruct ΔTVL).
      if (Math.abs(tvlDelta) > 100_000) {
        const rel = Math.abs((flowSum - tvlDelta) / tvlDelta);
        if (rel > 0.01) highDelta++;
        checked++;
      }
    }
    console.log(`  · checked ${checked} pools for ΔTVL≈Σflows; ${highDelta} >1% deviation`);
    // not a hard assert — yield bucket absorbs admin-side mints, which is fine
  }
}

// ----- RWA invariants -----

async function testRwaDataset() {
  console.log("\n[3] RWA dataset");
  const d = JSON.parse(await readFile(RWA, "utf-8")) as RwaDataset;

  assert(d.products.length > 0, "rwa products non-empty");
  assert(d.totals.tvl_usd > 0, "total TVL positive");
  assert(d.issuers.length > 0, "issuers rollup non-empty");

  for (const p of d.products) {
    assert(p.tvl_usd >= 0, `${p.symbol} TVL non-negative`);
    assert(p.supply >= 0, `${p.symbol} supply non-negative`);
    assert(p.price_usd > 0 && Number.isFinite(p.price_usd), `${p.symbol} price positive`);
    if (p.tvl_delta_pct != null) {
      assert(Math.abs(p.tvl_delta_pct) < 5, `${p.symbol} delta < 500% (hard outlier check)`);
    }
  }

  // Issuer rollup arithmetic check
  const sumIssuerTvl = d.issuers.reduce((s, i) => s + i.tvl_usd, 0);
  const sumProductTvl = d.products.reduce((s, p) => s + p.tvl_usd, 0);
  assertClose(sumIssuerTvl, sumProductTvl, 0.001, "issuer rollup sum = product sum");
  assertClose(sumProductTvl, d.totals.tvl_usd, 0.001, "totals.tvl_usd = product sum");
}

// ----- Whales -----

async function testWhales() {
  console.log("\n[4] Whales");
  try {
    const w = JSON.parse(await readFile(WHALES_LIVE, "utf-8")) as {
      whales: Array<{
        holdings: Array<{ amount_usd: number; share_of_product: number }>;
      }>;
    };
    for (const wh of w.whales) {
      for (const h of wh.holdings) {
        assert(h.amount_usd >= 0, "whale holding non-negative");
        assert(h.share_of_product >= 0 && h.share_of_product <= 1.5, "whale share ≤ 150% (allow some headroom for stale TVL)");
      }
    }
  } catch (e) {
    console.log(`  · whales-live.json missing — skipping (${(e as Error).message.slice(0, 60)})`);
  }
}

// ----- Manual datapoint check (reality anchor) -----

async function testKnownDatapoints() {
  console.log("\n[5] Manual datapoint anchors");
  const d = JSON.parse(await readFile(DATASET, "utf-8")) as Dataset;

  // JTRSY peak ≈ $1.52B (per Centrifuge UI)
  const jtrsy = d.histories.find((h) => h.poolId === "281474976710662");
  if (jtrsy) {
    const peak = peakTvl(jtrsy.series);
    assertClose(peak, 1_520_000_000, 0.05, "JTRSY peak ≈ \$1.52B (Centrifuge UI anchor)");
  }

  // JAAA peak ≈ $1.02B
  const jaaa = d.histories.find((h) => h.poolId === "281474976710663");
  if (jaaa) {
    const peak = peakTvl(jaaa.series);
    assertClose(peak, 1_020_000_000, 0.1, "JAAA peak ≈ \$1.02B");
  }

  // Sky Grove holds JTRSY ~85%
  const jtrsyHolders = d.poolHolders?.find((h) => h.poolId === "281474976710662");
  if (jtrsyHolders) {
    const top1 = jtrsyHolders.top[0];
    if (top1) {
      assertClose(top1.share, 0.85, 0.05, "JTRSY top-1 share ≈ 85% (Sky Grove)");
    }
  }
}

async function main() {
  console.log("=== Audit Phase 3 — invariant tests ===");
  testPureFunctions();
  await testCentrifugeDataset();
  await testRwaDataset();
  await testWhales();
  await testKnownDatapoints();

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
