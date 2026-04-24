# Documentation index

This `docs/` folder contains the audit trail and operational reference for
the dashboard. Files are roughly ordered: spec first, then audit findings,
then sources.

## Spec & lineage

- **[data-spec.md](data-spec.md)** — authoritative catalogue of every
  metric: source, formula, units, refresh, assumptions, gaps. Read this
  first when something on the dashboard looks wrong.
- **[SOURCES.md](SOURCES.md)** — registry of every external data source
  (API, scrape, hardcode) with refresh interval and fallback strategy.

## Audit log

- **[audit-phase2.md](audit-phase2.md)** — cross-validation. Found
  flows mixed-decimals bug; verified holder replay; confirmed BUIDL
  Polygon address.
- **[audit-phase3.md](audit-phase3.md)** — invariant tests (67,783
  assertions). Surfaced floating-point overflow on top-10 share, cohort
  retention non-monotonicity, APY outliers in tiny pools.
- **[audit-phase4.md](audit-phase4.md)** — determinism + reproducibility
  (182 assertions). Found day-1 yield bug in flows.ts (500-1300%
  drift on Tinlake); fixed.
- **[audit-phase5.md](audit-phase5.md)** — curated registry verification.
  All 9 product deployments verified on-chain for decimals + symbol;
  Polygon BUIDL not reachable from this Alchemy app.

Phase 1 (initial spec) and Phase 6 (public observability) didn't produce
standalone docs — phase 1's deliverable IS data-spec.md, and phase 6 ships
the `DataQualityBadge` component directly on the dashboard.

## How to use

If a number on the dashboard looks wrong:
1. Open [data-spec.md](data-spec.md), find the metric, read its formula
2. Check the latest audit doc for known issues
3. If unresolved, add to "Open audit questions" at end of data-spec.md
   and run `npm run audit:curated` + `npm run test` + `npm run test:determinism`

Daily cron pipeline:

```
update-daily.ts
 ├─ discover-pools.ts        Centrifuge pool registry
 ├─ backfill.ts              TVL + APY history
 ├─ flows.ts                 inflow/outflow/yield decomposition
 ├─ holders.ts               holder replay + Gini/HHI/cohorts/cross-pool
 ├─ benchmarks.ts            FRED T-Bill + AAA Corp
 ├─ rwa-tvl.ts               cross-issuer RWA TVL (multi-chain)
 ├─ rwa-whales-refresh.ts    anchor allocator balanceOf
 ├─ test-invariants.ts       67,783 assertions — fail breaks pipeline
 └─ test-determinism.ts        182 assertions — fail breaks pipeline
```

Failure in any step → no commit pushed → dashboard keeps yesterday's data.
