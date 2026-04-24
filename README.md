# Centrifuge Analytics

On-chain dashboard covering every tokenized asset on Centrifuge — Tinlake v2
legacy pools and Centrifuge V3 pools across Ethereum, Base, Arbitrum, Optimism,
Plume, Avalanche, BNB, and HyperEVM.

History starts **2025-01-01**.

## Data sources

| Source | Role |
|---|---|
| `centrifuge/tinlake-pools-mainnet` (GitHub) | Legacy Tinlake v2 pool registry + metadata |
| `https://api.centrifuge.io` (GraphQL) | V3 pools, tokens, and `tokenSnapshots` history |
| Alchemy (Ethereum archive) | Historical Tinlake v2 assessor reads (NAV / tranche prices) |
| IPFS via Pinata gateway | V3 pool metadata (issuer, asset class) |

## Scripts

```bash
npm run discover   # refresh public/data/pools.json
npm run backfill   # rebuild full TVL history → public/data/dataset.json
npm run update     # discover + backfill (used by GitHub Actions)
npm run dev        # local dashboard at http://localhost:3000
```

`ALCHEMY_API_KEY` must be in `.env.local`.

## Deployment

Host on Vercel (free tier fits). GitHub Actions re-runs `npm run update` daily
at 04:00 UTC, commits the refreshed JSON, and Vercel redeploys automatically.

Set `ALCHEMY_API_KEY` as a repository secret so the workflow can read it.

## Structure

```
app/                     Pages
  page.tsx               Overview — Centrifuge + cross-issuer entry points
  pools/[id]/page.tsx    Per-pool detail (TVL + flows + APY + holders + cohorts)
  compare/page.tsx       Side-by-side pool overlay
  rwa/page.tsx           Cross-issuer RWA market view
  rwa/[slug]/page.tsx    Per-product 5-layer research (technical/legal/economic/distribution/risk)
components/              Recharts + tables + observability badge
lib/
  alchemy.ts             Multi-chain viem client (eth/base/arb/op/polygon/avax)
  centrifuge-api.ts      Centrifuge V3 GraphQL client + IPFS gateways
  rwa-registry.ts        Hardcoded RWA product registry (verified 2026-04-25)
  rwa-counterparty.ts    Service provider matrix (custodian/auditor/oracle)
  rwa-whales.ts          Anchor allocator wallet registry
  anomalies.ts           Data quality anomaly detection (used by DataQualityBadge)
  data.ts, data.server.ts, types.ts
scripts/
  discover-pools.ts      Centrifuge pool registry
  backfill.ts            TVL + APY history (Centrifuge GraphQL + Alchemy archive)
  flows.ts               Daily inflow/outflow/yield decomposition
  holders.ts             Holder replay + Gini/HHI/cohorts/cross-pool overlap
  benchmarks.ts          FRED T-Bill + AAA Corp yields
  rwa-tvl.ts             Multi-chain RWA TVL with live NAV resolution
  rwa-whales-refresh.ts  Daily on-chain balanceOf for tracked wallets
  test-invariants.ts     67,783 assertions on data shape/values
  test-determinism.ts      182 assertions on idempotency/forward-fill/precision
  audit-curated.ts       On-chain verification of registry decimals/symbols
  update-daily.ts        Orchestrator — runs all of the above
docs/
  data-spec.md           Authoritative metric catalogue
  SOURCES.md             External source playbook
  audit-phase2..5.md     Audit findings + fixes per phase
public/data/
  pools.json             Centrifuge pool registry
  dataset.json           TVL + APY + flows + holders + benchmarks (main app input)
  rwa.json               Cross-issuer RWA snapshot
  whales-live.json       Live whale balances
  block-cache.json       Persistent timestamp→block mapping (saves Alchemy CU)
```

## Documentation

See [docs/](docs/) for audit trail, data lineage, and source playbook.

Start with [docs/data-spec.md](docs/data-spec.md) when investigating a number.
