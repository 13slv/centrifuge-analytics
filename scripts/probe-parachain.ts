/**
 * Connect directly to the Centrifuge Chain (Polkadot parachain) RPC and
 * read pool data from on-chain storage. Verifies whether JTRSY/JAAA have
 * additional native shares not visible via V3 GraphQL.
 *
 * Pallet of interest: `poolSystem` — stores Pool struct per pool ID with
 * tranches[].totalIssuance.
 */
import { ApiPromise, WsProvider } from "@polkadot/api";

const RPC = "wss://fullnode.centrifuge.io";

async function main() {
  console.log(`Connecting to ${RPC}...`);
  const provider = new WsProvider(RPC);
  const api = await ApiPromise.create({ provider });
  const chain = await api.rpc.system.chain();
  const version = await api.rpc.system.version();
  console.log(`Connected: ${chain} ${version}\n`);

  // List all pools in poolSystem
  console.log("Listing all pools in poolSystem.pool storage:");
  // @ts-expect-error — runtime-typed API
  const entries = await api.query.poolSystem.pool.entries();
  console.log(`  found ${entries.length} pool(s)\n`);

  // Fetch metadata IPFS hashes
  const metaMap = new Map<string, string>();
  try {
    // @ts-expect-error
    const metaEntries = await api.query.poolRegistry.poolMetadata.entries();
    for (const [key, value] of metaEntries) {
      // @ts-expect-error
      const pid = key.args[0].toString();
      const v = (value as { toHuman: () => { metadata?: string } }).toHuman();
      if (v?.metadata) metaMap.set(pid, v.metadata);
    }
  } catch {}

  for (const [key, value] of entries) {
    // @ts-expect-error
    const poolId = key.args[0].toString();
    // @ts-expect-error
    const pool = value.toHuman() as {
      tranches?: { tranches?: Array<{ currency?: [string, string]; trancheType?: string }> };
    };
    const tranches = pool.tranches?.tranches ?? [];

    // For each tranche, query totalIssuance via ormlTokens
    let poolTotalShares = 0n;
    const trancheIssuances: string[] = [];
    for (const t of tranches) {
      if (!t.currency) continue;
      const [pid, hash] = t.currency;
      try {
        // ormlTokens.totalIssuance accepts CurrencyId — for tranche it's Tranche((poolId, hash))
        // @ts-expect-error
        const issuance = await api.query.ormlTokens.totalIssuance({
          Tranche: [pid.replace(/,/g, ""), hash],
        });
        const raw = BigInt(issuance.toString());
        poolTotalShares += raw;
        trancheIssuances.push(`${t.trancheType}:${raw.toString()}`);
      } catch (e) {
        trancheIssuances.push(`${t.trancheType}:err(${(e as Error).message.slice(0, 30)})`);
      }
    }

    const ipfsCid = metaMap.get(poolId);
    let name = "(no metadata)";
    if (ipfsCid) {
      try {
        const cid = ipfsCid.replace(/^ipfs:\/\//, "");
        const res = await fetch(`https://centrifuge.mypinata.cloud/ipfs/${cid}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const json = (await res.json()) as { pool?: { name?: string }; name?: string };
          name = json.pool?.name || json.name || "(metadata empty)";
        }
      } catch {}
    }

    // Centrifuge Chain native shares typically use 18 decimals
    const sharesHuman = Number(poolTotalShares) / 1e18;
    console.log(
      `\n  poolId=${poolId.padEnd(12)}  tranches=${tranches.length}  totalShares(18dec)=${sharesHuman.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(20)}  name="${name}"`,
    );
    console.log(`     ipfs:${ipfsCid ?? "-"}`);
    console.log(`     issuances: ${trancheIssuances.join(", ")}`);
  }

  // Try to read pool metadata via poolRegistry (the names live there)
  console.log("\nPool metadata (poolRegistry):");
  try {
    // @ts-expect-error
    const metaEntries = await api.query.poolRegistry.poolMetadata.entries();
    for (const [key, value] of metaEntries.slice(0, 20)) {
      // @ts-expect-error
      const poolId = key.args[0].toString();
      const meta = value.toHuman?.() ?? value.toString();
      console.log(`  poolId=${poolId}  metadata=${JSON.stringify(meta).slice(0, 100)}`);
    }
  } catch (e) {
    console.log(`  (poolRegistry unavailable: ${(e as Error).message.slice(0, 80)})`);
  }

  await api.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
