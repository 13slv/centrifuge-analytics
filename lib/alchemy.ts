import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet, polygon, arbitrum, optimism, base, avalanche } from "viem/chains";

export type SupportedChain =
  | "ethereum"
  | "polygon"
  | "arbitrum"
  | "optimism"
  | "base"
  | "avalanche";

const CHAIN_MAP = {
  ethereum: { chain: mainnet, host: "eth-mainnet" },
  polygon: { chain: polygon, host: "polygon-mainnet" },
  arbitrum: { chain: arbitrum, host: "arb-mainnet" },
  optimism: { chain: optimism, host: "opt-mainnet" },
  base: { chain: base, host: "base-mainnet" },
  avalanche: { chain: avalanche, host: "avax-mainnet" },
} as const;

export function chainClient(chain: SupportedChain): PublicClient {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("ALCHEMY_API_KEY not set");
  const cfg = CHAIN_MAP[chain];
  return createPublicClient({
    chain: cfg.chain,
    transport: http(`https://${cfg.host}.g.alchemy.com/v2/${key}`, {
      retryCount: 6,
      retryDelay: 1500,
      batch: false,
      timeout: 30_000,
    }),
  }) as PublicClient;
}

export function ethClient(): PublicClient {
  return chainClient("ethereum");
}

// Simple throttle — free-tier Alchemy is ~5 rps. Space out calls.
let lastCall = 0;
const MIN_INTERVAL_MS = 220;

export async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

// block-by-timestamp lookup (binary search once, then cache results).
let latestBlock: bigint | null = null;
let latestTs: number | null = null;

export async function blockForTimestamp(
  client: PublicClient,
  targetTs: number,
): Promise<bigint> {
  if (!latestBlock || !latestTs) {
    await throttle();
    const b = await client.getBlock({ blockTag: "latest" });
    latestBlock = b.number;
    latestTs = Number(b.timestamp);
  }
  const latest = latestBlock!;
  const latestT = latestTs!;
  if (targetTs >= latestT) return latest;

  let lo = 0n;
  let hi = latest;
  while (lo + 1n < hi) {
    const mid = (lo + hi) / 2n;
    await throttle();
    const b = await client.getBlock({ blockNumber: mid });
    const t = Number(b.timestamp);
    if (t <= targetTs) lo = mid;
    else hi = mid;
  }
  return lo;
}

// daily dates (UTC midnight) between start (inclusive) and end (exclusive)
export function dailyDatesUtc(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(startIso + "T00:00:00Z").getTime();
  const end = new Date(endIso + "T00:00:00Z").getTime();
  for (let t = start; t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
