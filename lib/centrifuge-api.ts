export const CENTRIFUGE_API = "https://api.centrifuge.io/";

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(CENTRIFUGE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Centrifuge API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors) throw new Error(`GraphQL: ${json.errors.map((e) => e.message).join(", ")}`);
  if (!json.data) throw new Error("No data in GraphQL response");
  return json.data;
}

// centrifugeId → chain slug used in our dataset.
// Source: api.centrifuge.io blockchains query (verified 2026-04-25).
export const CENTRIFUGE_CHAIN_MAP: Record<string, { chain: string; chainId: number }> = {
  "1": { chain: "ethereum", chainId: 1 },
  "2": { chain: "base", chainId: 8453 },
  "3": { chain: "arbitrum", chainId: 42161 },
  "4": { chain: "plume", chainId: 98866 },
  "5": { chain: "avalanche", chainId: 43114 },
  "6": { chain: "bnb", chainId: 56 },
  "9": { chain: "hyperevm", chainId: 999 },
  "10": { chain: "optimism", chainId: 10 },
  "11": { chain: "monad", chainId: 143 },
  "12": { chain: "lumia", chainId: 1672 },
};

export async function fetchIpfsJson(uri: string): Promise<unknown | null> {
  if (!uri || !uri.startsWith("ipfs://")) return null;
  const hash = uri.replace("ipfs://", "");
  const gateways = [
    `https://centrifuge.mypinata.cloud/ipfs/${hash}`,
    `https://cloudflare-ipfs.com/ipfs/${hash}`,
    `https://ipfs.io/ipfs/${hash}`,
  ];
  for (const url of gateways) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return await res.json();
    } catch {
      // try next gateway
    }
  }
  return null;
}
