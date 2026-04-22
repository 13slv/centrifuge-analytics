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
app/
  page.tsx                overview + aggregate chart + pools table
  pools/[id]/page.tsx     per-pool detail with TVL chart
components/
  TvlChart.tsx            recharts area chart
  PoolsTable.tsx          filterable/sortable pool list
lib/
  centrifuge-api.ts       GraphQL client + IPFS fetch
  alchemy.ts              viem client + timestamp→block
  types.ts, data.ts
scripts/
  discover-pools.ts       pools registry builder
  backfill.ts             TVL history builder
  update-daily.ts         discover + backfill
public/data/
  pools.json              registry
  dataset.json            pools + per-pool TVL series (consumed by app)
```
