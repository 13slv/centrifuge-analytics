/**
 * Build daily TVL history for every pool from START_DATE until today.
 *
 * - V3 pools: query tokenSnapshots from Centrifuge API (aggregated server-side).
 * - Tinlake v2: archive reads via Alchemy (assessor prices × tranche supplies).
 *
 * Output: public/data/dataset.json (pools + histories merged for the dashboard).
 */
import "dotenv/config";
import { config } from "dotenv";
import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAbi, formatUnits } from "viem";
import { gql } from "../lib/centrifuge-api.js";
import { ethClient, blockForTimestamp, dailyDatesUtc, throttle } from "../lib/alchemy.js";
import type { ApyPoint, Dataset, Pool, PoolHistory, TvlPoint } from "../lib/types.js";

config({ path: ".env.local", override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const POOLS_PATH = join(__dirname, "..", "public", "data", "pools.json");
const DATASET_PATH = join(__dirname, "..", "public", "data", "dataset.json");
const BLOCK_CACHE_PATH = join(__dirname, "..", "public", "data", "block-cache.json");

const START_DATE = "2025-01-01";
const END_DATE = new Date().toISOString().slice(0, 10);

type InstanceSnapshot = {
  timestamp: string;
  centrifugeId: string;
  tokenPrice: string | null;
  totalIssuance: string | null;
};

type TokenSnapshot = {
  id: string;
  timestamp: string;
  yield30d365: string | null;
};

type V3Token = { id: string; poolId: string; decimals: number | null };

type TokenInstance = { tokenId: string; centrifugeId: string };

async function allV3Tokens(): Promise<V3Token[]> {
  const all: V3Token[] = [];
  let offset = 0;
  while (true) {
    const res = await gql<{ tokens: { items: V3Token[] } }>(
      `{ tokens(limit: 500, offset: ${offset}) { items { id poolId decimals } } }`,
    );
    all.push(...res.tokens.items);
    if (res.tokens.items.length < 500) break;
    offset += 500;
  }
  return all;
}

async function instancesForToken(tokenId: string): Promise<TokenInstance[]> {
  const res = await gql<{ tokenInstances: { items: TokenInstance[] } }>(
    `query($tid: String!) { tokenInstances(where: { tokenId: $tid }, limit: 50) {
        items { tokenId centrifugeId } } }`,
    { tid: tokenId },
  );
  return res.tokenInstances.items;
}

async function instanceSnapshots(
  tokenId: string,
  centrifugeId: string,
): Promise<InstanceSnapshot[]> {
  const all: InstanceSnapshot[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await gql<{ tokenInstanceSnapshots: { items: InstanceSnapshot[] } }>(
      `query($tid: String!, $cid: String!) { tokenInstanceSnapshots(
          where: { tokenId: $tid, centrifugeId: $cid },
          orderBy: "timestamp", orderDirection: "asc",
          limit: ${limit}, offset: ${offset}
        ) { items { timestamp centrifugeId tokenPrice totalIssuance } } }`,
      { tid: tokenId, cid: centrifugeId },
    );
    all.push(...res.tokenInstanceSnapshots.items);
    if (res.tokenInstanceSnapshots.items.length < limit) break;
    offset += limit;
    if (offset > 20_000) break;
  }
  return all;
}

async function apySnapshots(tokenId: string): Promise<TokenSnapshot[]> {
  const all: TokenSnapshot[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await gql<{ tokenSnapshots: { items: TokenSnapshot[] } }>(
      `query($id: String!) { tokenSnapshots(
          where: { id: $id },
          orderBy: "timestamp", orderDirection: "asc",
          limit: ${limit}, offset: ${offset}
        ) { items { id timestamp yield30d365 } } }`,
      { id: tokenId },
    );
    all.push(...res.tokenSnapshots.items);
    if (res.tokenSnapshots.items.length < limit) break;
    offset += limit;
    if (offset > 20_000) break;
  }
  return all;
}

function buildTvlSeries(
  instanceSnaps: Map<string, InstanceSnapshot[]>, // key = tokenId|centrifugeId
  apySnaps: Map<string, TokenSnapshot[]>, // key = tokenId
  decimalsByToken: Map<string, number>,
): { tvl: TvlPoint[]; apy: ApyPoint[] } {
  const dayInstanceTvl = new Map<string, Map<string, number>>(); // date -> instanceKey -> tvl
  const dayTokenApy = new Map<string, Map<string, number>>();
  const startMs = new Date(START_DATE + "T00:00:00Z").getTime();
  const tokenByInstance = new Map<string, string>();

  for (const [instKey, snaps] of instanceSnaps) {
    const tokenId = instKey.split("|")[0];
    tokenByInstance.set(instKey, tokenId);
    const dec = decimalsByToken.get(tokenId) ?? 18;
    for (const s of snaps) {
      const tMs = Number(s.timestamp);
      if (tMs < startMs) continue;
      const date = new Date(tMs).toISOString().slice(0, 10);
      const supply = Number(formatUnits(BigInt(s.totalIssuance || "0"), dec));
      const price =
        s.tokenPrice && s.tokenPrice !== "0"
          ? Number(formatUnits(BigInt(s.tokenPrice), 18))
          : 0;
      const tvl = supply * price;
      let inner = dayInstanceTvl.get(date);
      if (!inner) {
        inner = new Map();
        dayInstanceTvl.set(date, inner);
      }
      inner.set(instKey, tvl);
    }
  }

  for (const [tokenId, snaps] of apySnaps) {
    for (const s of snaps) {
      const tMs = Number(s.timestamp);
      if (tMs < startMs) continue;
      const date = new Date(tMs).toISOString().slice(0, 10);
      if (s.yield30d365 && s.yield30d365 !== "0") {
        const apy = Number(formatUnits(BigInt(s.yield30d365), 27));
        let inA = dayTokenApy.get(date);
        if (!inA) {
          inA = new Map();
          dayTokenApy.set(date, inA);
        }
        inA.set(tokenId, apy);
      }
    }
  }

  const dates = dailyDatesUtc(START_DATE, END_DATE);
  const lastInstTvl = new Map<string, number>();
  const lastApy = new Map<string, number>();
  const tvl: TvlPoint[] = [];
  const apy: ApyPoint[] = [];
  let sawAny = false;
  for (const date of dates) {
    const daily = dayInstanceTvl.get(date);
    const dailyA = dayTokenApy.get(date);
    if (daily) {
      sawAny = true;
      for (const [k, v] of daily) lastInstTvl.set(k, v);
    }
    if (dailyA) for (const [tid, v] of dailyA) lastApy.set(tid, v);
    if (!sawAny) continue;
    let total = 0;
    const tokenTvl = new Map<string, number>();
    for (const [instKey, v] of lastInstTvl) {
      total += v;
      const tid = tokenByInstance.get(instKey)!;
      tokenTvl.set(tid, (tokenTvl.get(tid) ?? 0) + v);
    }
    tvl.push({ date, tvl_usd: total });
    let num = 0;
    let den = 0;
    for (const [tid, t] of tokenTvl) {
      const a = lastApy.get(tid);
      if (a != null && t > 0) {
        num += a * t;
        den += t;
      }
    }
    if (den > 0) apy.push({ date, apy: num / den });
  }
  return { tvl, apy };
}

// --- Tinlake v2 on-chain reads ---
const ASSESSOR_ABI = parseAbi([
  "function calcSeniorTokenPrice() view returns (uint256)",
  "function calcJuniorTokenPrice() view returns (uint256)",
]);
const ERC20_ABI = parseAbi(["function totalSupply() view returns (uint256)"]);

async function loadBlockCache(): Promise<Map<string, bigint>> {
  try {
    const raw = await readFile(BLOCK_CACHE_PATH, "utf-8");
    const obj = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(obj).map(([k, v]) => [k, BigInt(v)]));
  } catch {
    return new Map();
  }
}

async function saveBlockCache(m: Map<string, bigint>): Promise<void> {
  const obj: Record<string, string> = {};
  for (const [k, v] of m) obj[k] = v.toString();
  await writeFile(BLOCK_CACHE_PATH, JSON.stringify(obj, null, 2));
}

async function precomputeBlocks(
  client: ReturnType<typeof ethClient>,
  dates: string[],
  sampleEvery: number,
): Promise<Map<string, bigint>> {
  const cache = await loadBlockCache();
  const m = new Map<string, bigint>(cache);
  let newLookups = 0;
  for (let i = 0; i < dates.length; i++) {
    if (i % sampleEvery !== 0 && i !== dates.length - 1) continue;
    const date = dates[i];
    if (m.has(date)) continue; // cached
    const ts = Math.floor(new Date(date + "T23:59:59Z").getTime() / 1000);
    const bn = await blockForTimestamp(client, ts);
    m.set(date, bn);
    newLookups++;
  }
  if (newLookups > 0) {
    await saveBlockCache(m);
    console.log(`    (${newLookups} new block lookup(s), rest from cache)`);
  } else {
    console.log(`    (all from cache)`);
  }
  return m;
}

async function tinlakeTvlHistory(
  pool: Pool,
  client: ReturnType<typeof ethClient>,
  blockByDate: Map<string, bigint>,
): Promise<TvlPoint[]> {
  if (!pool.assessorAddress) return [];
  const dates = dailyDatesUtc(START_DATE, END_DATE);
  const senior = pool.tranches.find((t) => t.seniority === "senior");
  const junior = pool.tranches.find((t) => t.seniority === "junior");

  const series: TvlPoint[] = [];
  let lastTvl = 0;
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const blockNumber = blockByDate.get(date);
    if (!blockNumber) {
      series.push({ date, tvl_usd: lastTvl });
      continue;
    }
    try {
      // Sequential reads with throttling — parallel Promise.all() bursts hit 429 on free tier.
      await throttle();
      const seniorSupply = senior?.address
        ? await client
            .readContract({
              address: senior.address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "totalSupply",
              blockNumber,
            })
            .catch(() => 0n)
        : 0n;
      await throttle();
      const juniorSupply = junior?.address
        ? await client
            .readContract({
              address: junior.address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "totalSupply",
              blockNumber,
            })
            .catch(() => 0n)
        : 0n;
      await throttle();
      const seniorPrice = await client
        .readContract({
          address: pool.assessorAddress as `0x${string}`,
          abi: ASSESSOR_ABI,
          functionName: "calcSeniorTokenPrice",
          blockNumber,
        })
        .catch(() => 0n);
      await throttle();
      const juniorPrice = await client
        .readContract({
          address: pool.assessorAddress as `0x${string}`,
          abi: ASSESSOR_ABI,
          functionName: "calcJuniorTokenPrice",
          blockNumber,
        })
        .catch(() => 0n);
      const sSupply = Number(formatUnits(seniorSupply as bigint, 18));
      const jSupply = Number(formatUnits(juniorSupply as bigint, 18));
      // Tinlake token price is 27-decimal "ray"
      const sPrice = Number(formatUnits(seniorPrice as bigint, 27));
      const jPrice = Number(formatUnits(juniorPrice as bigint, 27));
      lastTvl = sSupply * sPrice + jSupply * jPrice;
    } catch {
      // keep lastTvl
    }
    series.push({ date, tvl_usd: lastTvl });
  }
  return series;
}

async function main() {
  const poolsFile = JSON.parse(await readFile(POOLS_PATH, "utf-8")) as { pools: Pool[] };
  const pools = poolsFile.pools;
  const histories: PoolHistory[] = [];

  const v3 = pools.filter((p) => p.version === "cfg_v3");
  const tinlake = pools.filter((p) => p.version === "tinlake_v2");

  console.log(`\n=== V3 pools (${v3.length}) ===`);
  const tokens = await allV3Tokens();
  console.log(`  loaded ${tokens.length} V3 tokens`);
  const tokensByPool = new Map<string, V3Token[]>();
  for (const t of tokens) {
    const arr = tokensByPool.get(t.poolId) ?? [];
    arr.push(t);
    tokensByPool.set(t.poolId, arr);
  }

  for (const p of v3) {
    const poolTokens = tokensByPool.get(p.id) ?? [];
    process.stdout.write(`  ${(p.name || p.id).slice(0, 55).padEnd(56)} `);
    if (poolTokens.length === 0) {
      console.log("no tokens");
      histories.push({ poolId: p.id, series: [] });
      continue;
    }
    try {
      const instSnaps = new Map<string, InstanceSnapshot[]>();
      const apyByToken = new Map<string, TokenSnapshot[]>();
      const decByToken = new Map<string, number>();
      for (const t of poolTokens) {
        decByToken.set(t.id, t.decimals ?? 18);
        const instances = await instancesForToken(t.id);
        for (const inst of instances) {
          const key = `${t.id}|${inst.centrifugeId}`;
          const snaps = await instanceSnapshots(t.id, inst.centrifugeId);
          instSnaps.set(key, snaps);
        }
        apyByToken.set(t.id, await apySnapshots(t.id));
      }
      const { tvl, apy } = buildTvlSeries(instSnaps, apyByToken, decByToken);
      histories.push({ poolId: p.id, series: tvl, apySeries: apy });
      const peak = tvl.reduce((m, s) => Math.max(m, s.tvl_usd), 0);
      const lastApy = apy[apy.length - 1]?.apy;
      const apyStr = lastApy != null ? ` · APY ${(lastApy * 100).toFixed(2)}%` : "";
      console.log(
        `${tvl.length.toString().padStart(4)}d, peak $${(peak / 1e6).toFixed(2)}M${apyStr}`,
      );
    } catch (e) {
      console.log(`ERROR: ${(e as Error).message}`);
      histories.push({ poolId: p.id, series: [] });
    }
  }

  console.log(`\n=== Tinlake v2 pools (${tinlake.length}) ===`);
  const client = tinlake.length > 0 ? ethClient() : null;
  let blockByDate = new Map<string, bigint>();
  if (client) {
    process.stdout.write(`  precomputing block lookup for archive reads... `);
    const dates = dailyDatesUtc(START_DATE, END_DATE);
    blockByDate = await precomputeBlocks(client, dates, 7);
    console.log(`${blockByDate.size} sample blocks`);
  }
  for (const p of tinlake) {
    process.stdout.write(`  ${(p.shortName || p.name).slice(0, 55).padEnd(56)} `);
    try {
      const series = await tinlakeTvlHistory(p, client!, blockByDate);
      histories.push({ poolId: p.id, series });
      const peak = series.reduce((m, s) => Math.max(m, s.tvl_usd), 0);
      console.log(`${series.length.toString().padStart(4)}d, peak $${(peak / 1e6).toFixed(2)}M`);
    } catch (e) {
      console.log(`ERROR: ${(e as Error).message}`);
      histories.push({ poolId: p.id, series: [] });
    }
  }

  const dataset: Dataset = {
    generatedAt: new Date().toISOString(),
    startDate: START_DATE,
    endDate: END_DATE,
    pools,
    histories,
  };
  await writeFile(DATASET_PATH, JSON.stringify(dataset));
  console.log(`\nWrote dataset → ${DATASET_PATH}`);

  const withData = histories.filter((h) => h.series.length > 0).length;
  const totalPeak = pools.reduce((acc, p) => {
    const h = histories.find((x) => x.poolId === p.id);
    const peak = h?.series.reduce((m, s) => Math.max(m, s.tvl_usd), 0) ?? 0;
    return acc + peak;
  }, 0);
  console.log(`  ${withData}/${pools.length} pools with data, sum of peaks $${(totalPeak / 1e6).toFixed(1)}M`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
