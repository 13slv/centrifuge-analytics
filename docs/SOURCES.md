# External data sources

Every source the dashboard depends on. When a source breaks, this is the
playbook.

| Source | Type | Used for | Refresh | Fallback |
|---|---|---|---|---|
| **Centrifuge V3 GraphQL** (`api.centrifuge.io`) | API, no auth | Pool registry, TVL via `tokenInstanceSnapshots`, APY (`yield30d365`), investor txs (flows + holders), token metadata | Daily via `discover-pools.ts`, `backfill.ts`, `flows.ts`, `holders.ts` | None — Centrifuge data simply doesn't refresh that day |
| **Alchemy RPC** | API, free tier (300M CU/mo) | On-chain reads: Tinlake assessor calls, RWA `totalSupply` per chain, ERC-4626 `totalAssets`, whale `balanceOf` | Daily via `backfill.ts`, `rwa-tvl.ts`, `rwa-whales-refresh.ts` | Throttled to 5rps (`lib/alchemy.ts` throttle) + retry-on-429 + `block-cache.json` skip; if persistently down, last `dataset.json` is reused |
| **GitHub raw** (`raw.githubusercontent.com/centrifuge/tinlake-pools-mainnet`) | Static JSON | Tinlake legacy pool registry + metadata | On `discover-pools.ts` runs | Stale registry persists if 404s |
| **GitHub raw** (`centrifuge/protocol-v3/env/*.json`) | Static JSON | Centrifuge V3 deployment configs | Manual (in `scripts/data/`) | n/a — used once, hardcoded |
| **IPFS** (Centrifuge Pinata gateway, Cloudflare, ipfs.io) | Pinned content | Pool metadata for V3 pools | On `discover-pools.ts` runs | 3 gateways tried sequentially; if all fail, pool gets fallback name |
| **FRED** (`fredgraph.csv?id=DGS3MO|DAAA`) | CSV download, no auth | 3M T-Bill + AAA Corp benchmark yields | Daily via `benchmarks.ts` | Retries 15s/30s/60s, then keeps previous data with warning |
| **CoinGecko** (`api.coingecko.com/.../pax-gold`) | API, free | Live gold spot price for PAXG/XAUt NAV | Daily via `rwa-tvl.ts` | Falls back to `$4000/oz` hardcode if API timeouts |
| **PolygonScan / BaseScan / etc.** | Block explorer (manual) | Verifying contract addresses for new chain deployments | Manual research only | n/a |
| **RWA.xyz** | Manual scrape (UI screenshot) | Reference TVL for cross-validation | Manual, refreshed periodically into `rwa-registry.ts` | Hardcoded values, age tracked via `rwaxyz_as_of` |
| **Sky governance** (`vote.sky.money`) | Web research | Whale wallet identification + holdings | Manual, refreshed when major Sky governance vote happens | n/a — registry is hardcoded |
| **Issuer prospectuses** (BlackRock, Anemoy, Superstate, etc.) | PDF documents | Counterparty mapping (custodian, fund admin, auditor, oracle) | Quarterly manual review | Hardcoded in `lib/rwa-counterparty.ts`, dated via header comment |

## Failure modes seen in production

| Symptom | Root cause | Fix |
|---|---|---|
| 429 from Alchemy on Tinlake archive reads | Free-tier 5rps limit + 2000 binary-search calls on cold cache | block-cache.json + 220ms throttle ([Phase 2 fix](audit-phase2.md)) |
| FRED CSV timeout from GitHub-hosted runners | Their IP rate-limited by FRED | 3-tier retry + fallback to existing data (Sprint B) |
| `github-actions[bot]` 403 on git push | Default workflow token is read-only | `permissions: contents: write` in workflow yaml |
| TokenSnapshot.totalIssuance returns 0 across all V3 tokens | Centrifuge API field deprecated | Switch to `tokenInstanceSnapshots` with `centrifugeId` filter ([T1 fix](audit-phase2.md#stage-c-multi-chain-fix)) |
| InvestorTransaction.currencyAmount mixed decimals | Indexer emits 6-dec for some events, 18-dec for others | Magnitude-based detection (threshold 1e15) ([Phase 2 fix](audit-phase2.md)) |
| Day-1 opening balance counted as yield in flows | `prevTvl` initialised to 0 | Initialise to `history[0].tvl_usd` ([Phase 4 fix](audit-phase4.md)) |

## Adding a new source

1. Add fetcher in `scripts/<source>.ts` with timeout + retry
2. On failure: log warning, fall back to previous data — DO NOT exit non-zero
3. Add row to this table
4. If user-facing: add freshness check to `lib/anomalies.ts`
