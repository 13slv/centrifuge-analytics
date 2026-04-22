/**
 * Reconstruct per-pool holder balances by replaying every investorTransaction
 * (DEPOSIT_CLAIMED / REDEEM_CLAIMED / TRANSFER_IN / TRANSFER_OUT) in timestamp
 * order, then compute daily concentration metrics + cohorts.
 *
 * Output merged into dataset.json under poolHolders.
 */
import "dotenv/config";
import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatUnits } from "viem";
import { gql } from "../lib/centrifuge-api.js";
import type {
  CohortRow,
  HolderSnapshot,
  Pool,
  PoolHistory,
  PoolHolders,
  TopHolder,
} from "../lib/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = join(__dirname, "..", "public", "data", "dataset.json");
const HOLDERS_PATH = join(__dirname, "..", "public", "data", "holders.json");

const START_DATE = "2025-01-01";
const START_MS = new Date(START_DATE + "T00:00:00Z").getTime();
const DUST = 1; // balance below this share amount treated as zero

type InvestorTx = {
  txHash: string;
  type: string;
  poolId: string;
  tokenId: string;
  account: string;
  tokenAmount: string;
  createdAt: string;
};

async function fetchAll(): Promise<InvestorTx[]> {
  const all: InvestorTx[] = [];
  let offset = 0;
  const limit = 1000;
  const types = ["DEPOSIT_CLAIMED", "REDEEM_CLAIMED", "TRANSFER_IN", "TRANSFER_OUT"];
  while (true) {
    const res = await gql<{ investorTransactions: { items: InvestorTx[] } }>(
      `query($types: [InvestorTransactionType!]) {
        investorTransactions(
          where: { type_in: $types },
          orderBy: "createdAt", orderDirection: "asc",
          limit: ${limit}, offset: ${offset}
        ) { items { txHash type poolId tokenId account tokenAmount createdAt } }
      }`,
      { types },
    );
    all.push(...res.investorTransactions.items);
    if (res.investorTransactions.items.length < limit) break;
    offset += limit;
    if (offset > 200_000) break;
  }
  return all;
}

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

function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

async function main() {
  const ds = JSON.parse(await readFile(DATASET_PATH, "utf-8")) as {
    pools: Pool[];
    histories: PoolHistory[];
    [k: string]: unknown;
  };
  const { pools, histories } = ds;
  const histMap = new Map(histories.map((h) => [h.poolId, h]));

  console.log("Fetching investorTransactions (all types)...");
  const txs = await fetchAll();
  console.log(`  ${txs.length} tx records`);

  // group by poolId
  const byPool = new Map<string, InvestorTx[]>();
  for (const tx of txs) {
    const arr = byPool.get(tx.poolId) ?? [];
    arr.push(tx);
    byPool.set(tx.poolId, arr);
  }

  // Token decimals — pull token list once
  const tokensRes = await gql<{ tokens: { items: { id: string; decimals: number | null }[] } }>(
    `{ tokens(limit: 1000) { items { id decimals } } }`,
  );
  const decByToken = new Map<string, number>();
  for (const t of tokensRes.tokens.items) decByToken.set(t.id, t.decimals ?? 18);

  const poolHolders: PoolHolders[] = [];

  for (const p of pools) {
    const history = histMap.get(p.id)?.series ?? [];
    const poolTxs = byPool.get(p.id) ?? [];
    if (poolTxs.length === 0 && history.length === 0) {
      poolHolders.push({ poolId: p.id, series: [], top: [], cohorts: [] });
      continue;
    }

    // Replay txs: maintain per-account share balance (summing across tokens for the pool).
    // We keep share amounts as Number (sufficient precision for dashboards).
    const balance = new Map<string, number>();
    const firstDeposit = new Map<string, string>(); // account -> YYYY-MM-DD first deposit-like event

    // price-by-date for conversion to USD: use pool TVL history to derive effective average price
    // (share count grows over time; for holder USD value use latest tokenPrice ≈ TVL / supply)
    // Simplification: use latest history.tvl_usd / sum(balance.values()) as avg price at query time
    // For per-date USD snapshots, we'd need per-date price; defer — use final USD valuation only.

    // sort by createdAt ascending (already asc from query but recheck)
    poolTxs.sort((a, b) => Number(a.createdAt) - Number(b.createdAt));

    const dayIndex = new Map<string, number>(); // date → latest snapshot index written
    const series: HolderSnapshot[] = [];

    let txIdx = 0;
    for (const { date } of history) {
      const dateMs = new Date(date + "T23:59:59Z").getTime();
      while (txIdx < poolTxs.length && Number(poolTxs[txIdx].createdAt) <= dateMs) {
        const t = poolTxs[txIdx];
        const dec = decByToken.get(t.tokenId) ?? 18;
        const amt = Number(formatUnits(BigInt(t.tokenAmount || "0"), dec));
        const sign =
          t.type === "DEPOSIT_CLAIMED" || t.type === "TRANSFER_IN"
            ? 1
            : t.type === "REDEEM_CLAIMED" || t.type === "TRANSFER_OUT"
              ? -1
              : 0;
        if (sign !== 0 && amt > 0) {
          const acct = t.account.toLowerCase();
          const cur = balance.get(acct) ?? 0;
          const next = cur + sign * amt;
          balance.set(acct, next);
          if (sign > 0 && !firstDeposit.has(acct)) {
            const d = new Date(Number(t.createdAt)).toISOString().slice(0, 10);
            if (d >= START_DATE) firstDeposit.set(acct, d);
          }
        }
        txIdx++;
      }

      // snapshot
      const active: number[] = [];
      for (const v of balance.values()) if (v > DUST) active.push(v);
      const total = active.reduce((s, v) => s + v, 0);
      const sorted = [...active].sort((a, b) => b - a);
      const top10 = sorted.slice(0, 10).reduce((s, v) => s + v, 0);
      series.push({
        date,
        holders: active.length,
        top10_share: total > 0 ? top10 / total : 0,
        hhi: hhi(active),
        gini: gini(active),
      });
      dayIndex.set(date, series.length - 1);
    }

    // Top holders at latest snapshot, converted to USD
    const latestTvl = history[history.length - 1]?.tvl_usd ?? 0;
    const totalShares = Array.from(balance.values()).filter((v) => v > DUST).reduce(
      (s, v) => s + v,
      0,
    );
    const priceApprox = totalShares > 0 ? latestTvl / totalShares : 1;
    const topSorted = Array.from(balance.entries())
      .filter(([, v]) => v > DUST)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    const top: TopHolder[] = topSorted.map(([account, shares]) => ({
      account,
      balance_usd: shares * priceApprox,
      share: totalShares > 0 ? shares / totalShares : 0,
      first_seen: firstDeposit.get(account) ?? "",
    }));

    // Cohort retention: group by month of first deposit, then track each cohort's
    // aggregate SHARE balance across subsequent months (as % of cohort's peak).
    const cohortMap = new Map<string, Set<string>>(); // YYYY-MM → set of accounts
    for (const [acct, first] of firstDeposit) {
      if (!first) continue;
      const m = monthOf(first);
      const s = cohortMap.get(m) ?? new Set();
      s.add(acct);
      cohortMap.set(m, s);
    }

    const months = Array.from(
      new Set(history.map((h) => monthOf(h.date))),
    ).sort();
    const lastMonthBalanceByAcct = new Map<string, number>();
    for (const [acct, shares] of balance) {
      if (shares > DUST) lastMonthBalanceByAcct.set(acct, shares);
    }

    // For a cleaner cohort computation, we recompute balances at end of each month.
    // Build month-end balance maps from the per-day balance replay:
    // We already have dayIndex but not per-month-end balances stored separately.
    // Re-replay once more, capturing end-of-month balances per account.
    const monthBalances = new Map<string, Map<string, number>>();
    {
      const rep = new Map<string, number>();
      let i = 0;
      for (const m of months) {
        const endOfMonth = new Date(`${m}-01T00:00:00Z`);
        endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1);
        const cutoff = endOfMonth.getTime() - 1;
        while (i < poolTxs.length && Number(poolTxs[i].createdAt) <= cutoff) {
          const t = poolTxs[i];
          const dec = decByToken.get(t.tokenId) ?? 18;
          const amt = Number(formatUnits(BigInt(t.tokenAmount || "0"), dec));
          const sign =
            t.type === "DEPOSIT_CLAIMED" || t.type === "TRANSFER_IN"
              ? 1
              : t.type === "REDEEM_CLAIMED" || t.type === "TRANSFER_OUT"
                ? -1
                : 0;
          if (sign !== 0 && amt > 0) {
            const a = t.account.toLowerCase();
            rep.set(a, (rep.get(a) ?? 0) + sign * amt);
          }
          i++;
        }
        const snap = new Map<string, number>();
        for (const [a, v] of rep) if (v > DUST) snap.set(a, v);
        monthBalances.set(m, snap);
      }
    }

    const cohorts: CohortRow[] = [];
    for (const m of months) {
      const cohortAccts = cohortMap.get(m);
      if (!cohortAccts || cohortAccts.size === 0) continue;
      const retention: { month_offset: number; surviving: number }[] = [];
      const monthIdx = months.indexOf(m);
      for (let off = 0; off < months.length - monthIdx; off++) {
        const mKey = months[monthIdx + off];
        const bal = monthBalances.get(mKey) ?? new Map();
        let surviving = 0;
        for (const a of cohortAccts) if ((bal.get(a) ?? 0) > DUST) surviving++;
        retention.push({ month_offset: off, surviving });
      }
      cohorts.push({
        cohort: m,
        initial_investors: cohortAccts.size,
        retention,
      });
    }

    poolHolders.push({ poolId: p.id, series, top, cohorts });

    const latest = series[series.length - 1];
    if (latest && latest.holders > 0) {
      console.log(
        `  ${(p.name || p.id).slice(0, 45).padEnd(46)} ${latest.holders.toString().padStart(5)} holders · top10 ${(latest.top10_share * 100).toFixed(0)}% · gini ${latest.gini.toFixed(2)}`,
      );
    }
  }

  await writeFile(HOLDERS_PATH, JSON.stringify({ poolHolders }));
  const current = JSON.parse(await readFile(DATASET_PATH, "utf-8")) as Record<string, unknown>;
  current.poolHolders = poolHolders;
  current.generatedAt = new Date().toISOString();
  await writeFile(DATASET_PATH, JSON.stringify(current));
  console.log(`\nWrote ${poolHolders.length} holder series → dataset.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
