import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";

export function ethClient(): PublicClient {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("ALCHEMY_API_KEY not set");
  return createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${key}`, {
      // viem's retry gives up too quickly for free-tier 429 bursts. Bump it.
      retryCount: 6,
      retryDelay: 1500,
      batch: false,
      timeout: 30_000,
    }),
  }) as PublicClient;
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
