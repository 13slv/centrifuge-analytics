/**
 * Collect every Centrifuge pool (Tinlake v2 + V3 across all chains) into
 * public/data/pools.json. Run: `npm run discover`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gql, CENTRIFUGE_CHAIN_MAP, fetchIpfsJson } from "../lib/centrifuge-api.js";
import type { Pool, Tranche } from "../lib/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "data", "pools.json");

const TINLAKE_REPO_API =
  "https://api.github.com/repos/centrifuge/tinlake-pools-mainnet/contents/metadata";

type TinlakeFile = { name: string; download_url: string; type: string };

type TinlakeMetadata = {
  network: string;
  addresses: Record<string, string>;
  metadata: {
    name: string;
    shortName?: string;
    slug: string;
    description?: string;
    currencySymbol?: string;
    asset: string;
    attributes?: { Issuer?: string; Links?: Record<string, unknown> };
    newInvestmentsStatus?: { senior: string; junior: string };
    isArchived?: boolean;
    isUpcoming?: boolean;
  };
};

async function discoverTinlake(): Promise<Pool[]> {
  const files = (await (await fetch(TINLAKE_REPO_API)).json()) as TinlakeFile[];
  const poolFiles = files.filter(
    (f) => f.type === "file" && f.name.startsWith("0x") && f.name.endsWith(".json"),
  );
  const pools: Pool[] = [];
  for (const file of poolFiles) {
    const meta = (await (await fetch(file.download_url)).json()) as TinlakeMetadata;
    const a = meta.addresses;
    const tranches: Tranche[] = [];
    if (a.SENIOR_TOKEN) {
      tranches.push({
        id: `${a.ROOT_CONTRACT}-senior`,
        address: a.SENIOR_TOKEN,
        symbol: "DROP",
        seniority: "senior",
        decimals: 18,
      });
    }
    if (a.JUNIOR_TOKEN) {
      tranches.push({
        id: `${a.ROOT_CONTRACT}-junior`,
        address: a.JUNIOR_TOKEN,
        symbol: "TIN",
        seniority: "junior",
        decimals: 18,
      });
    }
    const status: Pool["status"] = meta.metadata.isArchived
      ? "closed"
      : meta.metadata.newInvestmentsStatus &&
          meta.metadata.newInvestmentsStatus.senior === "closed" &&
          meta.metadata.newInvestmentsStatus.junior === "closed"
        ? "closed"
        : "active";
    pools.push({
      id: a.ROOT_CONTRACT,
      version: "tinlake_v2",
      chain: "ethereum",
      name: meta.metadata.name,
      shortName: meta.metadata.shortName,
      slug: meta.metadata.slug,
      issuer: meta.metadata.attributes?.Issuer,
      assetClass: meta.metadata.asset,
      currency: meta.metadata.currencySymbol || "DAI",
      status,
      createdAt: "",
      description: meta.metadata.description,
      tranches,
      rootAddress: a.ROOT_CONTRACT,
      reserveAddress: a.RESERVE,
      assessorAddress: a.ASSESSOR,
    });
  }
  return pools;
}

type V3Pool = {
  id: string;
  centrifugeId: string;
  isActive: boolean;
  currency: string | null;
  decimals: number | null;
  metadata: string | null;
  name: string | null;
  createdAt: string;
  createdAtBlock: number;
};

type V3Token = {
  id: string;
  poolId: string;
  centrifugeId: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  isActive: boolean;
};

async function discoverV3(): Promise<Pool[]> {
  const poolsRes = await gql<{ pools: { items: V3Pool[] } }>(
    `{ pools(limit: 500) { items { id centrifugeId isActive currency decimals metadata name createdAt createdAtBlock } } }`,
  );
  const tokensRes = await gql<{ tokens: { items: V3Token[] } }>(
    `{ tokens(limit: 1000) { items { id poolId centrifugeId symbol name decimals isActive } } }`,
  );
  const tokensByPool = new Map<string, V3Token[]>();
  for (const t of tokensRes.tokens.items) {
    const arr = tokensByPool.get(t.poolId) ?? [];
    arr.push(t);
    tokensByPool.set(t.poolId, arr);
  }
  const pools: Pool[] = [];
  for (const p of poolsRes.pools.items) {
    const chainInfo = CENTRIFUGE_CHAIN_MAP[p.centrifugeId];
    if (!chainInfo) continue;
    const ipfs = p.metadata
      ? ((await fetchIpfsJson(p.metadata)) as {
          pool?: {
            name?: string;
            issuer?: { name?: string };
            asset?: { class?: string; subClass?: string };
          };
        } | null)
      : null;
    const tokens = tokensByPool.get(p.id) ?? [];
    const tranches: Tranche[] = tokens.map((t, i) => ({
      id: t.id,
      symbol: t.symbol || `SHARE-${i}`,
      seniority: tokens.length > 1 ? (i === 0 ? "senior" : "junior") : "single",
      decimals: t.decimals ?? 18,
    }));
    const rawCurrency = p.currency;
    const currencySymbol =
      rawCurrency === "840" ? "USDC" : rawCurrency === null ? "?" : "USD-variant";
    pools.push({
      id: p.id,
      version: "cfg_v3",
      chain: chainInfo.chain as Pool["chain"],
      name: ipfs?.pool?.name || p.name || `Pool ${p.id}`,
      issuer: ipfs?.pool?.issuer?.name,
      assetClass: ipfs?.pool?.asset?.class || ipfs?.pool?.asset?.subClass || "Unknown",
      currency: currencySymbol,
      status: p.isActive ? "active" : "closed",
      createdAt: new Date(Number(p.createdAt)).toISOString(),
      createdAtBlock: p.createdAtBlock,
      metadataUri: p.metadata || undefined,
      tranches,
    });
  }
  return pools;
}

async function main() {
  console.log("Discovering Tinlake v2 pools...");
  const tinlake = await discoverTinlake();
  console.log(`  found ${tinlake.length} Tinlake pools`);

  console.log("Discovering V3 pools via Centrifuge API...");
  const v3 = await discoverV3();
  console.log(`  found ${v3.length} V3 pools`);

  const pools = [...tinlake, ...v3];
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), pools }, null, 2));
  console.log(`\nWrote ${pools.length} pools → ${OUT}`);

  const byChain = new Map<string, number>();
  const byClass = new Map<string, number>();
  for (const p of pools) {
    byChain.set(p.chain, (byChain.get(p.chain) ?? 0) + 1);
    byClass.set(p.assetClass, (byClass.get(p.assetClass) ?? 0) + 1);
  }
  console.log("\nBy chain:");
  for (const [k, v] of byChain) console.log(`  ${k}: ${v}`);
  console.log("\nBy asset class:");
  for (const [k, v] of byClass) console.log(`  ${k}: ${v}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
