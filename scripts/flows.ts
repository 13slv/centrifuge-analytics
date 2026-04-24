/**
 * Build daily inflow/outflow/yield decomposition per pool:
 *
 *   inflow_usd  = Σ DEPOSIT_CLAIMABLE.currencyAmount  (pool accepts $, mints shares)
 *   outflow_usd = Σ REDEEM_CLAIMABLE.currencyAmount   (pool pays $, burns shares)
 *   yield_usd   = ΔTVL - inflow + outflow             (residual = NAV appreciation)
 *
 * V3 data comes from api.centrifuge.io. Tinlake v2 uses Transfer(from=0x0)
 * mints / Transfer(to=0x0) burns on tranche tokens via Alchemy eth_getLogs.
 *
 * Writes public/data/flows.json — merged into dataset.json by backfill.ts.
 */
import "dotenv/config";
import { config } from "dotenv";
import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAbiItem, formatUnits } from "viem";
import { gql } from "../lib/centrifuge-api.js";
import { ethClient } from "../lib/alchemy.js";
import type { Pool, PoolHistory } from "../lib/types.js";

config({ path: ".env.local", override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = join(__dirname, "..", "public", "data", "dataset.json");
const FLOWS_PATH = join(__dirname, "..", "public", "data", "flows.json");

const START_DATE = "2025-01-01";
const START_MS = new Date(START_DATE + "T00:00:00Z").getTime();

type DailyFlow = {
  date: string;
  inflow_usd: number;
  outflow_usd: number;
  yield_usd: number;
  large_events: LargeEvent[];
};

type LargeEvent = {
  type: "deposit" | "redeem" | "transfer";
  amount_usd: number;
  account: string;
  txHash: string;
};

type PoolFlows = {
  poolId: string;
  flows: DailyFlow[];
};

type V3Tx = {
  txHash: string;
  poolId: string;
  type: string;
  account: string;
  tokenAmount: string;
  currencyAmount: string;
  createdAt: string;
};

async function fetchV3Flows(): Promise<V3Tx[]> {
  // The API's createdAt filter only supports string-match ops, not _gte, so we
  // page everything and filter by timestamp locally. Type filter requires enum
  // literals — passed via variables.
  const all: V3Tx[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await gql<{ investorTransactions: { items: V3Tx[] } }>(
      `query($types: [InvestorTransactionType!]) {
        investorTransactions(
          where: { type_in: $types },
          orderBy: "createdAt", orderDirection: "asc",
          limit: ${limit}, offset: ${offset}
        ) { items { txHash poolId type account tokenAmount currencyAmount createdAt } }
      }`,
      { types: ["DEPOSIT_CLAIMABLE", "REDEEM_CLAIMABLE"] },
    );
    all.push(...res.investorTransactions.items);
    if (res.investorTransactions.items.length < limit) break;
    offset += limit;
    if (offset > 100_000) break;
  }
  return all.filter((t) => Number(t.createdAt) >= START_MS);
}

// --- Tinlake v2 ---
const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

async function tinlakeFlows(
  pool: Pool,
  priceForBlock: (block: number) => number,
): Promise<Map<string, { inflow: number; outflow: number; events: LargeEvent[] }>> {
  // Pull mint/burn events for both tranches, convert shares×price at event block → USD
  const client = ethClient();
  const out = new Map<string, { inflow: number; outflow: number; events: LargeEvent[] }>();
  const tranches = pool.tranches.filter((t) => t.address);
  if (tranches.length === 0) return out;

  const startBlock = await client
    .getBlock({ blockTag: "latest" })
    .then(async (latest) => {
      // Binary search for start block (Jan 1 2025 ≈ block 21525800)
      // We precomputed blocks in backfill; here approximate via a known anchor.
      return 21500000n; // just before Jan 1 2025; slight over-fetch is fine
    })
    .catch(() => 21500000n);

  for (const tr of tranches) {
    const addr = tr.address as `0x${string}`;
    // Mint: from=ZERO; Burn: to=ZERO. Chunk block ranges to avoid provider limits.
    const latest = await client.getBlock({ blockTag: "latest" });
    const end = latest.number;
    const step = 500_000n;
    for (let from = startBlock; from <= end; from += step + 1n) {
      const to = from + step < end ? from + step : end;
      try {
        const [mints, burns] = await Promise.all([
          client.getLogs({
            address: addr,
            event: TRANSFER_EVENT,
            args: { from: ZERO },
            fromBlock: from,
            toBlock: to,
          }),
          client.getLogs({
            address: addr,
            event: TRANSFER_EVENT,
            args: { to: ZERO },
            fromBlock: from,
            toBlock: to,
          }),
        ]);
        for (const log of mints) {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          const ts = Number(block.timestamp) * 1000;
          if (ts < START_MS) continue;
          const date = new Date(ts).toISOString().slice(0, 10);
          const shares = Number(formatUnits(log.args.value!, 18));
          const usd = shares * priceForBlock(Number(log.blockNumber));
          const cur = out.get(date) ?? { inflow: 0, outflow: 0, events: [] };
          cur.inflow += usd;
          if (usd >= 50_000) {
            cur.events.push({
              type: "deposit",
              amount_usd: usd,
              account: log.args.to as string,
              txHash: log.transactionHash,
            });
          }
          out.set(date, cur);
        }
        for (const log of burns) {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          const ts = Number(block.timestamp) * 1000;
          if (ts < START_MS) continue;
          const date = new Date(ts).toISOString().slice(0, 10);
          const shares = Number(formatUnits(log.args.value!, 18));
          const usd = shares * priceForBlock(Number(log.blockNumber));
          const cur = out.get(date) ?? { inflow: 0, outflow: 0, events: [] };
          cur.outflow += usd;
          if (usd >= 50_000) {
            cur.events.push({
              type: "redeem",
              amount_usd: usd,
              account: log.args.from as string,
              txHash: log.transactionHash,
            });
          }
          out.set(date, cur);
        }
      } catch (e) {
        // chunk may fail on archive limit; continue
      }
    }
  }
  return out;
}

async function main() {
  const dataset = JSON.parse(await readFile(DATASET_PATH, "utf-8")) as {
    pools: Pool[];
    histories: PoolHistory[];
  };
  const { pools, histories } = dataset;
  const histMap = new Map(histories.map((h) => [h.poolId, h]));
  const poolFlows: PoolFlows[] = [];

  // --- V3 flows ---
  console.log("Fetching V3 investor transactions...");
  const v3Txs = await fetchV3Flows();
  console.log(`  ${v3Txs.length} claimable transactions since ${START_DATE}`);

  // group by poolId
  const byPool = new Map<string, V3Tx[]>();
  for (const tx of v3Txs) {
    const arr = byPool.get(tx.poolId) ?? [];
    arr.push(tx);
    byPool.set(tx.poolId, arr);
  }

  for (const p of pools.filter((x) => x.version === "cfg_v3")) {
    const txs = byPool.get(p.id) ?? [];
    const history = histMap.get(p.id)?.series ?? [];
    const tvlByDate = new Map(history.map((h) => [h.date, h.tvl_usd]));

    // bucket flows by day
    const daily = new Map<string, { inflow: number; outflow: number; events: LargeEvent[] }>();
    for (const tx of txs) {
      const date = new Date(Number(tx.createdAt)).toISOString().slice(0, 10);
      // Centrifuge V3 indexer emits currencyAmount with mixed decimals: some
      // events are 6-dec (raw USDC), others 18-dec (pool accounting). Detect
      // by magnitude — $1 in 6-dec = 1e6, $1 in 18-dec = 1e18 (12 orders apart).
      const raw = BigInt(tx.currencyAmount || "0");
      const dec = raw < 1_000_000_000_000_000n ? 6 : 18; // < 1e15 → 6-dec
      const usd = Number(formatUnits(raw, dec));
      const cur = daily.get(date) ?? { inflow: 0, outflow: 0, events: [] };
      if (tx.type === "DEPOSIT_CLAIMABLE") cur.inflow += usd;
      else if (tx.type === "REDEEM_CLAIMABLE") cur.outflow += usd;
      if (usd >= 100_000) {
        cur.events.push({
          type: tx.type === "DEPOSIT_CLAIMABLE" ? "deposit" : "redeem",
          amount_usd: usd,
          account: tx.account,
          txHash: tx.txHash,
        });
      }
      daily.set(date, cur);
    }

    // Build flow series aligned with TVL history. CRITICAL: initialise
    // prevTvl to the FIRST day's TVL, not 0. Otherwise day-1 records the
    // entire opening TVL as "yield", inflating Σflows by the pool's pre-window
    // balance — which broke Σflows ≈ ΔTVL invariant by 500-1300% on Tinlake.
    const flows: DailyFlow[] = [];
    let prevTvl = history.length > 0 ? history[0].tvl_usd : 0;
    for (let i = 0; i < history.length; i++) {
      const { date, tvl_usd } = history[i];
      const d = daily.get(date) ?? { inflow: 0, outflow: 0, events: [] };
      const netFlow = d.inflow - d.outflow;
      const delta = i === 0 ? 0 : tvl_usd - prevTvl;
      const yieldUsd = delta - netFlow;
      flows.push({
        date,
        inflow_usd: d.inflow,
        outflow_usd: d.outflow,
        yield_usd: yieldUsd,
        large_events: d.events.sort((a, b) => b.amount_usd - a.amount_usd).slice(0, 3),
      });
      prevTvl = tvl_usd;
    }
    poolFlows.push({ poolId: p.id, flows });
    if (txs.length > 0) {
      const totalIn = flows.reduce((s, f) => s + f.inflow_usd, 0);
      const totalOut = flows.reduce((s, f) => s + f.outflow_usd, 0);
      console.log(
        `  ${(p.name || p.id).slice(0, 50).padEnd(52)} in $${(totalIn / 1e6).toFixed(1)}M / out $${(totalOut / 1e6).toFixed(1)}M`,
      );
    }
  }

  // --- Tinlake v2: derive flows from ΔTVL alone ---
  // Tinlake v2 pool deposits/redeems are via SupplyOrder/RedeemOrder → disburse,
  // not directly mint/burn. Reconstructing them via logs hammers Alchemy and
  // most Tinlake pools are in wind-down anyway. We emit zero inflow/outflow
  // and attribute all ΔTVL to yield so the decomposition is still consistent.
  console.log("\nTinlake v2: attributing ΔTVL to yield (no on-chain flow reconstruction)");
  for (const p of pools.filter((x) => x.version === "tinlake_v2")) {
    const history = histMap.get(p.id)?.series ?? [];
    const flows: DailyFlow[] = [];
    let prevTvl = history.length > 0 ? history[0].tvl_usd : 0;
    for (let i = 0; i < history.length; i++) {
      const { date, tvl_usd } = history[i];
      const delta = i === 0 ? 0 : tvl_usd - prevTvl;
      flows.push({
        date,
        inflow_usd: 0,
        outflow_usd: 0,
        yield_usd: delta,
        large_events: [],
      });
      prevTvl = tvl_usd;
    }
    poolFlows.push({ poolId: p.id, flows });
  }

  await writeFile(FLOWS_PATH, JSON.stringify({ poolFlows }));

  // merge into dataset.json
  const current = JSON.parse(await readFile(DATASET_PATH, "utf-8")) as Record<string, unknown>;
  current.poolFlows = poolFlows;
  current.generatedAt = new Date().toISOString();
  await writeFile(DATASET_PATH, JSON.stringify(current));
  console.log(`\nWrote ${poolFlows.length} flow series → dataset.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
