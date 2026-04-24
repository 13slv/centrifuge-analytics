# Data spec

Authoritative catalogue of every metric the dashboard displays. For each metric:
**source**, **formula**, **units**, **refresh cadence**, **assumptions**, **gaps**.

When something on the dashboard looks wrong, start here. Audit Phase 2 cross-validates
against external sources; this doc is the input to that.

Last revised: 2026-04-25.

---

## 1. Architecture

```
┌─────────────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│ External sources    │ →  │ ETL scripts          │ →  │ public/data/*.json │ →  Pages
└─────────────────────┘    └──────────────────────┘    └────────────────────┘
  Centrifuge GraphQL          discover-pools.ts          pools.json              /
  Alchemy RPC (6 chains)      backfill.ts                dataset.json            /pools/[id]
  IPFS metadata               flows.ts                   flows.json              /compare
  GitHub (tinlake meta)       holders.ts                 holders.json            /rwa
  FRED CSV                    benchmarks.ts              rwa.json                /rwa/[slug]
  CoinGecko                   rwa-tvl.ts                 whales-live.json
  Hardcoded registries        rwa-whales-refresh.ts      block-cache.json
                              update-daily.ts (orchestr)
```

All ETL runs via GitHub Actions cron 04:00 UTC (`.github/workflows/update-data.yml`).
Each script writes a single JSON file in `public/data/`. Pages read those files at
build time + ISR `revalidate=3600`.

---

## 2. Data files

### `public/data/dataset.json` — Centrifuge primary
Written by `backfill.ts` (TVL), `flows.ts` (flows), `holders.ts` (holders),
`benchmarks.ts` (FRED). Each subsequent script reads + augments + writes.

```ts
type Dataset = {
  generatedAt: string;        // ISO timestamp of last successful run
  startDate: string;          // "2025-01-01" — fixed lower bound
  endDate: string;            // YYYY-MM-DD of latest run
  pools: Pool[];              // 37 entries (V3 + Tinlake v2)
  histories: PoolHistory[];   // {poolId, series, apySeries}
  poolFlows?: PoolFlows[];    // {poolId, flows[]}
  poolHolders?: PoolHolders[];// {poolId, series[], top[], cohorts[]}
  benchmarks?: { ust_3m, aaa_corp };
  crossPoolOverlap?: CrossPoolOverlap[];
};
```

### `public/data/rwa.json` — Cross-issuer RWA
Written by `rwa-tvl.ts`. Reads `dataset.json` to merge JTRSY/JAAA.

```ts
type RwaDataset = {
  generatedAt: string;
  products: RwaSnapshot[];   // 11 (9 hardcoded + 2 from Centrifuge)
  issuers: IssuerRollup[];
  totals: { tvl_usd, products, issuers, by_category };
};
```

### `public/data/whales-live.json` — Anchor allocator balances
Written by `rwa-whales-refresh.ts`. Reads `rwa.json` for current prices.

```ts
{
  generatedAt: string;
  whales: Array<{
    address, label, org, controller, notes,
    holdings: Array<{
      product_slug, product_symbol, amount_usd, raw_balance,
      share_of_product, source, refreshed_at
    }>;
  }>;
}
```

### `public/data/pools.json` — Centrifuge pool registry
Written by `discover-pools.ts`. Read by `backfill.ts` and other downstream.

### `public/data/block-cache.json`
Written by `backfill.ts`. Map `date → block_number` for Ethereum mainnet to
avoid binary-search per pool. Persisted to repo so cron reuses.

### `public/data/flows.json`, `public/data/holders.json` — sidecars
Written by their respective scripts; same data is also merged into
`dataset.json`. Sidecar exists for debugging / external consumers.

---

## 3. Metrics catalogue

### 3.1 Centrifuge layer (sourced from V3 GraphQL + Alchemy)

#### Pool registry
| Field | Source | Formula | Units | Notes |
|---|---|---|---|---|
| `pools[].id` | Centrifuge GraphQL `Pool.id` (V3) or root contract (Tinlake) | direct | string | V3 IDs are uint128 BigInt; Tinlake IDs are 0x... addresses |
| `pools[].chain` | `centrifugeId` mapped via `CENTRIFUGE_CHAIN_MAP` | direct | enum | 1→ethereum, 2→base, 3→arbitrum, 4→plume, 5→avalanche, 6→bnb, 9→hyperevm, 10→optimism |
| `pools[].name` | IPFS metadata `pool.name` → fallback to `Pool.name` → fallback to `${tokenSymbol} (Pool ${id_suffix})` | direct | string | Sprint A added the symbol fallback |
| `pools[].assetClass` | IPFS `pool.asset.class` or `subClass` | direct | string | 4 pools "Unknown" — IPFS metadata empty |
| `pools[].issuer` | IPFS `pool.issuer.name` | direct | string | Optional |
| `pools[].status` | Tinlake: `isArchived` flag → "closed". V3: `isActive` → "active"/"closed" | direct | enum | |
| `pools[].tranches[]` | Tinlake: from `addresses.SENIOR_TOKEN/JUNIOR_TOKEN`. V3: from `Token` records grouped by `poolId` | direct | array | |

**Refresh**: daily via `discover-pools.ts`. **Gaps**: V3 pools created since last run picked up next day. **Assumption**: pool `name` in API is canonical; IPFS metadata sometimes overrides.

#### TVL series (`histories[].series`)
| Field | Source | Formula | Units | Notes |
|---|---|---|---|---|
| `tvl_usd` (V3) | `tokenInstanceSnapshots` (Centrifuge GraphQL) | `Σ_(token,centrifugeId)( supply / 10^decimals × price / 10^18 )` | USD | **price assumed 18-dec across all V3 pools** — verified empirically |
| `tvl_usd` (Tinlake v2) | Alchemy archive `eth_call` on `assessor.calcSeniorTokenPrice()` + `tranche.totalSupply()` | `seniorSupply × seniorPrice + juniorSupply × juniorPrice` | USD | **price 27-dec ("ray")**, **supply 18-dec**. Sampled every 7 days, forward-filled |
| `apy` | `tokenSnapshots.yield30d365` | `value / 10^27` (ray) | fraction (0.035 = 3.5%) | TVL-weighted across pool's tokens |

**Refresh**: daily via `backfill.ts`. **Forward-fill**: missing days carry the previous day's value (instead of going to 0). **Gaps**: Tinlake `calcSeniorTokenPrice()` reverts after pool wind-down → falls back to last-known. **Assumption**: tokenInstanceSnapshots cross-chain summing = real total supply (no double-count). Burn-mint LayerZero topology assumed. **Audit**: verify by comparing sum to BlackRock/Anemoy reported AUM.

#### Flows (`poolFlows[].flows[]`)
| Field | Source | Formula | Units | Notes |
|---|---|---|---|---|
| `inflow_usd` (V3) | Centrifuge GraphQL `investorTransactions` where `type == "DEPOSIT_CLAIMABLE"` | `Σ currencyAmount / 10^18` | USD | **currency assumed 18-dec at pool level** |
| `outflow_usd` (V3) | Same query, `type == "REDEEM_CLAIMABLE"` | same | USD | |
| `yield_usd` | Residual: `ΔTVL[d] − inflow + outflow` | computed | USD | Captures NAV appreciation + admin-side mints/burns |
| `inflow_usd` (Tinlake) | n/a | always 0 | USD | **Known gap**: Tinlake flows = on-chain Supply/Redeem events; not implemented (would 429 Alchemy). All ΔTVL attributed to yield bucket |
| `large_events[]` | Filter `inflow + outflow >= $100K`, top 3 per day | direct | events | Each event: type, amount, account, txHash |

**Refresh**: daily via `flows.ts`. **Gaps**: see Tinlake row. **Assumption #1**: pool's accounting currency is 18-dec — needs verification per pool. **Assumption #2**: DEPOSIT_CLAIMABLE = pool-side settlement, accurately captures investor inflow at the moment shares are minted. **Audit**: pick 1 day with high JTRSY activity and hand-verify against on-chain logs.

#### Holders (`poolHolders[]`)
| Field | Source | Formula | Units | Notes |
|---|---|---|---|---|
| `series[].holders` | replay of `investorTransactions` | count of accounts with balance > 1 share dust | int | |
| `series[].top10_share` | same | `Σ_top10(balance) / Σ_all(balance)` | fraction | |
| `series[].gini` | same | standard Gini formula on per-account balances | fraction | 0 = equal, 1 = monopoly |
| `series[].hhi` | same | `Σ (share)²` | fraction | Same scale as Gini |
| `top[]` | same | top 20 accounts at latest snapshot, USD-valued via `latestTvl / totalShares × accountShares` | objects | **price approximation** — uses pool-level avg, not per-token |
| `cohorts[]` | same | group by month of first +balance event; track survival | objects | monthly only |

**Replay logic** (`scripts/holders.ts`):
- `DEPOSIT_CLAIMED` / `TRANSFER_IN` → +tokenAmount to account
- `REDEEM_CLAIMED` / `TRANSFER_OUT` → −tokenAmount from account
- Iterate ascending timestamp; each day's snapshot taken at end-of-day

**Risks**:
1. **Double-count**: if a single transfer emits both TRANSFER_IN (to receiver) and TRANSFER_OUT (from sender), we apply both — that's correct. But if it also emits DEPOSIT_CLAIMED, we'd triple-count. **Audit**: verify by sampling a real tx hash.
2. **Burn/mint**: TRANSFER_IN from `0x0` (mint by admin) is treated same as user-to-user — that's intentional but worth flagging in UX.

#### Cross-pool overlap (`crossPoolOverlap[]`)
| Field | Source | Formula | Units | Notes |
|---|---|---|---|---|
| `shared_investors` | global balance map after replay | count(addresses with non-dust balance in both A and B) | int | |
| `migrated_amount_usd` | same | `Σ_addr min(usd_in_A, usd_in_B)` | USD | **misnomer** — this is "co-held", not "migrated" |

**Audit**: rename `migrated_amount_usd` → `coheld_usd`. Current label is misleading.

### 3.2 Benchmarks
| Field | Source | Formula | Units | Refresh |
|---|---|---|---|---|
| `benchmarks.ust_3m` | FRED `DGS3MO` series | divide by 100 (FRED gives % points) | fraction | daily |
| `benchmarks.aaa_corp` | FRED `DAAA` series | same | fraction | daily |

**Gaps**: FRED has gaps on weekends/holidays — UI forward-fills client-side in `TvlChart`.

### 3.3 RWA layer

#### `RwaSnapshot.supply`
| Source | Formula | Notes |
|---|---|---|
| Alchemy `totalSupply()` per deployment + `off_chain_supply` | `Σ_chain(rawSupply / 10^decimals) + off_chain_supply` | off_chain_supply is **manually hardcoded** in registry |

**Critical gap**: off_chain_supply for BUIDL ($1.5B), USYC ($2.5B Canton), USDY ($200M LayerZero), captures the chains we can't query. These numbers were sampled once from issuer reports. **Audit**: verify each against issuer's latest published AUM; add `off_chain_as_of` timestamp.

#### `RwaSnapshot.price_usd`
| priceSource.kind | Formula | Refresh |
|---|---|---|
| `static` | from `RwaProduct.price_usd` (hardcoded NAV) | manual |
| `erc4626` | `totalAssets() / totalSupply()` (both raw, scaled by decimals) | daily |
| `gold-spot` | CoinGecko `pax-gold` USD price | daily |

**Critical gap**: most products use `static` — NAV drifts, our number is stale. **Audit**: identify on-chain oracle for each (USTB has Chronicle, OUSG has Ondo internal feed) and switch from static. Add `price_as_of` timestamp.

#### `RwaSnapshot.tvl_usd`
| Formula | Notes |
|---|---|
| `supply × price_usd` | combines above two |

#### `RwaSnapshot.rwaxyz_tvl_usd`, `tvl_delta_pct`
| Source | Formula | Notes |
|---|---|---|
| `RwaProduct.rwaxyz_tvl_usd` (hardcoded) | `(our_tvl − rwax) / rwax` | **manually entered**, dated by `rwaxyz_as_of` |

**Audit**: refresh monthly; document URL where each value was sourced.

### 3.4 Whale layer

#### `whales-live.json` (auto-refreshed)
| Field | Source | Formula |
|---|---|---|
| `holdings[].amount_usd` (on-chain product) | Alchemy `balanceOf(whale_address)` × current `price_usd` from rwa.json | iterate all deployments per product |
| `holdings[].amount_usd` (Centrifuge JTRSY/JAAA) | inherits declared value from `WHALES` registry | not refreshed automatically (off-Eth source: Centrifuge GraphQL) |
| `holdings[].share_of_product` | `amount_usd / product.tvl_usd` | recomputed daily |

**Known issue**: BUIDL on-chain `balanceOf` returned 0 for Grove ALM Proxy — Etherscan says they hold $984M of `BUIDL-I` (yield distribution token), not principal `BUIDL`. **Audit**: add BUIDL-I as a separate registry entry or treat both as one for whale lookup.

### 3.5 Curated layer (manual hardcode — high audit priority)

#### `lib/rwa-counterparty.ts`
Custodian, fund admin, transfer agent, auditor, oracle, jurisdiction, regulator
per issuer. **All manually entered** from prospectuses / fund decks.

**Audit checklist**:
- [ ] Each row has a source URL in commit comment or sidecar doc
- [ ] Date of last verification per row (`as_of` field — currently missing)
- [ ] No assumed values (e.g. "Wall Street Custodian (per fund deck)" → actual name)

#### `lib/rwa-whales.ts`
Anchor wallet labels and declared holdings. **Mostly stale**: Sky Grove was sampled
on 2026-04-23. Will drift. **Audit**: replace with daily on-chain refresh (Sprint D
auto-refresh covers BUIDL but not JTRSY/JAAA; Centrifuge GraphQL needed for those).

#### `lib/rwa-registry.ts` — RWA_PRODUCTS
- contract addresses
- decimals
- launched dates
- off_chain_supply
- price_usd (for static)
- rwaxyz_tvl_usd

**Audit checklist** (per product):
- [ ] Verify contract on Etherscan exists and matches symbol
- [ ] Verify decimals via on-chain `decimals()` call
- [ ] Verify launched date via deploy block
- [ ] Source URL for off_chain_supply (issuer report PDF, blog post)
- [ ] Source date for rwaxyz_tvl_usd (which RWA.xyz scrape day)
- [ ] price_usd refresh policy: how is it kept current?

---

## 4. ETL scripts inventory

| Script | Inputs | Outputs | Runtime | CU budget |
|---|---|---|---|---|
| `discover-pools.ts` | Centrifuge GraphQL, GitHub tinlake-pools-mainnet, IPFS | `pools.json` | ~20s | none (no Alchemy) |
| `backfill.ts` | `pools.json`, Centrifuge GraphQL `tokenInstanceSnapshots`, Alchemy archive (Tinlake), `block-cache.json` | `dataset.json` | 5-15min (Tinlake reads dominate) | ~5K reads / day |
| `flows.ts` | `dataset.json`, Centrifuge GraphQL `investorTransactions` | `dataset.json + flows.json` | ~10s | none |
| `holders.ts` | `dataset.json`, Centrifuge GraphQL `investorTransactions` (all types) | `dataset.json + holders.json` | ~30s | none |
| `benchmarks.ts` | `dataset.json`, FRED CSV | `dataset.json` | ~5s | none |
| `rwa-tvl.ts` | `dataset.json`, Alchemy (6 chains), CoinGecko | `rwa.json` | ~30s | ~50 reads / day |
| `rwa-whales-refresh.ts` | `rwa.json`, Alchemy | `whales-live.json` | ~5s | ~10 reads / day |
| `update-daily.ts` | (orchestrator) | all of the above | 5-20min total | <6K reads / day |

**Free Alchemy**: 300M CU/month / 30 = 10M CU/day budget. We use ~5K reads × ~21 CU = 105K. Massive headroom.

---

## 5. Pages and consumers

| Page | Reads | Key components |
|---|---|---|
| `/` | `dataset.json` | TvlChart, AlertsPanel, AssetClassDrift, BreakdownList, CrossPoolOverlapList, PoolsTable |
| `/pools/[id]` | `dataset.json` | PoolCharts (TvlChart + FlowsChart + EventsList), HoldersPanel, CohortTable, CsvExportButton |
| `/compare` | `dataset.json` | CompareView |
| `/rwa` | `rwa.json` | issuer table, category breakdown, products table, WhaleExposurePanel, CounterpartyTable |
| `/rwa/[slug]` | `rwa.json` (per-product) | 5-layer research template |

ISR: all pages `revalidate=3600`. After `dataset.json` changes upstream (cron commit), page HTML is regenerated within 1h on next request.

---

## 6. Open audit questions (to answer in Phase 2-3)

1. **Multi-chain BUIDL**: do Polygon/Avalanche/Optimism deployments actually exist? If yes, find addresses; if no, off_chain_supply is wrong.
2. **JAAA $620M decline**: SPV-side burn vs admin-side mint — verify via on-chain `Transfer(from=*, to=0x0)` events count.
3. **TRANSFER vs DEPOSIT_CLAIMED double-count risk**: pick 5 random tx, verify each emits at most one balance-changing event per (account, token, tx).
4. **OUSG NAV $112.5 hardcoded**: actual OUSG NAV today via on-chain oracle?
5. **PAXG/XAUt > RWA.xyz reference by 2-4×**: is gold spot moving fast or are reference numbers stale? Verify supply on Etherscan.
6. **Cohort retention**: month boundary uses simple `slice(0,7)` — no timezone handling. Audit edge case where investor first deposit at 23:30 UTC end-of-month.
7. **`coheld` vs `migrated` naming**: rename for accuracy.
8. **Reference TVL `as_of` dates**: no field in registry; add and check freshness in build.

These become Phase 2 work items.
