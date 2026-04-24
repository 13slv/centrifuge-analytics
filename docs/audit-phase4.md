# Audit — Phase 4 findings

Reproducibility, determinism, ETL idempotency. Performed 2026-04-25.

Test runner: `npm run test:determinism` (`scripts/test-determinism.ts`).

## Result

**182 assertions passed / 0 failed.**

## Coverage

### 1. Block-cache integrity
- 71 cached `(date → block)` mappings exist
- Each date appears exactly once (no duplicates)
- Block numbers strictly ascending in date order (no time-travel)

### 2. ETL idempotency
- Run `rwa-tvl.ts` twice consecutively
- `generatedAt` updates ✓ (expected)
- Product count stable ✓
- Total TVL drift between consecutive runs <1% ✓ (live oracle prices may move pennies)
- No per-product TVL drift >1% ✓

### 3. Forward-fill correctness
- For pools with TVL >$1M, no spurious "drop to 0 then back" patterns
- Confirms `buildTvlSeries` forward-fills missing snapshot days correctly

### 4. Σflows ≈ ΔTVL identity
- Across 11 material pools (TVL ≥$100K)
- All have <0.1% drift between accumulated daily flows and end-to-end ΔTVL
- (Fixed an off-by-one bug — see below.)

## Bug found and fixed

### `flows.ts` — opening-balance counted as yield on day 1

`prevTvl` was initialized to `0`, then `delta = tvl_usd - prevTvl` ran for
day 1. For pools that already had TVL on the window's opening day (Tinlake
pools that existed since 2020), this recorded the entire opening balance
as "yield" on day 1.

**Impact**: Σflows was inflated by `pool.opening_tvl` for affected pools.
Test caught it as 500-1300% drift on 4 Tinlake pools:

```
Pool                ΔTVL       Σflow      drift before fix
New Silver 2        $5.65M     $48.14M    751%
Branch Series 3     $0.69M     $9.58M     1292%
Pool Ff63e3         -$5.38M    $0.62M     112%
Pool 75c7D6         -$0.44M    $1.97M     550%
```

**Fix**: initialize `prevTvl = history[0].tvl_usd` before the loop, and
emit `delta = 0` for the first day. Day 1 flow becomes a no-op
contribution; Σflows from day 2 onward telescopes correctly to
`TVL_end - TVL_start`.

Applied to both V3 and Tinlake branches in `flows.ts`. After fix, all
pools pass the 0.1% precision invariant.

## What this catches going forward

These tests run on every cron via `update-daily.ts`. If anyone:
- changes the flow accumulator
- swaps the JSON serializer (precision drift)
- rebuilds block cache wrong
- breaks forward-fill in TVL series
- introduces non-determinism in rwa-tvl

… the cron breaks before pushing bad data.

## Soft observations

- The Σflows identity holds **after** the day-1 fix only because yield
  bucket is computed as residual. If we ever change yield to an
  independent measurement, this identity becomes a real correctness check
  rather than a tautology.
- `rwa-tvl.ts` idempotency relies on stable on-chain reads. If Alchemy
  occasionally returns slightly different totalSupply between consecutive
  calls (mempool re-org), the tolerance check (1%) covers it. If we ever
  see real persistent drift, that's a data quality flag.

## Status

Phase 4 closes out the determinism leg of the audit. Remaining:
- Phase 5 — curated data review (counterparty + whale registry verification)
- Phase 6 — public observability (anomaly panel on dashboard)
- Phase 7 — lineage docs
