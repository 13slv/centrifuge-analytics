# Audit — Phase 2 findings

External cross-validation + deep on-chain checks against the data spec.
Performed 2026-04-25.

## Summary

| # | Question | Verdict | Severity |
|---|---|---|---|
| 1 | JAAA $620M decline — SPV-side or on-chain? | **Confirmed: real on-chain decline visible across chains; flow tracking under-counted by ~30×** | High (bug) |
| 2 | Holder replay double-counts? (DEPOSIT_CLAIMED + TRANSFER_IN) | **No — DEPOSIT_CLAIMED tx emit single record. Holder metrics valid.** | None (false alarm) |
| 3 | Multi-chain BUIDL — addresses on Polygon/etc? | **Polygon address found: `0x2893Ef551B6dD69F661Ac00F11D93E5Dc5Dc0e99`** | Medium (registry gap) |

---

## Finding 1: JAAA flow under-counting (bug)

### Evidence

JAAA token (`0x00010000000000070000000000000001`) lives on 7 chain instances. Sum of
`tokenInstanceSnapshots.totalIssuance` (with appropriate decimals):

| centrifugeId | Chain | Supply (6-dec) | TVL @ ~$1.03 |
|---|---|---|---|
| 1 | Ethereum | 141,000,536 shares | $145M |
| 2 | Base | 2,049 shares | $2K |
| 3 | Arbitrum | 7,290 shares | $8K |
| 5 | Avalanche | 250,000,001 shares | **$258M** |
| 6 | BNB | 489,724 shares | $504K |
| 11/12 | (testnets?) | trace | trace |
| **Total** | | **391M shares** | **~$403M** ✓ matches Centrifuge UI |

So peak $1.02B → current $403M is real.

### Bug

For the same token, `investorTransactions.currencyAmount` uses **mixed decimals**:

```
DEPOSIT_CLAIMABLE  curr=1000000                  token=1000000              ← 6-dec  ($1)
DEPOSIT_CLAIMABLE  curr=71385577219              token=69251172674          ← 6-dec  ($71K)
DEPOSIT_CLAIMABLE  curr=1000000000000000000      token=969902               ← 18-dec ($1)
```

Our `flows.ts` blindly divides by `1e18`, so the 6-dec events become dust:
- `1,000,000 / 1e18 = 1e-12` USD instead of $1
- This is why we reported **$0.5M total inflow** for JAAA across 15 months
  while the actual sum, when properly normalized, is **~$15M+**.

### Fix applied

Heuristic: detect scale by magnitude.
- `currencyAmount < 1e15` → 6-dec (USDC raw)
- `currencyAmount >= 1e15` → 18-dec (pool accounting)

Production-grade fix would be to query each token's `currency.decimals` from
the API, but the heuristic is robust given USD pegs ($1 in 6-dec = 1e6, $1 in
18-dec = 1e18 — 12 orders of magnitude apart).

### Impact

After the fix:
- Flows by pool become more meaningful — under-counted inflows now visible
- "yield_usd residual" component becomes more accurate
  (`yield = ΔTVL − inflow + outflow`, so inflow under-count was inflating yield)
- `flows.ts` rerun pushed updated numbers to dashboard

### Open follow-up

Also fix Tinlake flows in the same way (currently always 0). Sprint E.

---

## Finding 2: Holder replay — no double-count (false alarm)

### Evidence

Sampled 200 recent investor transactions, grouped by tx hash:

```
Multiplicity:
  1 record:  211 txs (40%)
  2 records:  61 txs
  3 records:  40 txs
  4 records:   5 txs
  7 records:   1 tx
```

40% of txs are single-record. The multi-record cases are all symmetric
TRANSFER pairs:

```
0x00a8843a21  TRANSFER_IN, TRANSFER_OUT, TRANSFER_IN, TRANSFER_OUT, TRANSFER_IN
              (3 unique accounts — multi-hop transfer through routers)
```

Each TRANSFER emits both:
- `TRANSFER_OUT` for the sender (account = sender)
- `TRANSFER_IN` for the receiver (account = receiver)

Our replay applies:
- TRANSFER_IN → +tokenAmount to receiver ✓
- TRANSFER_OUT → −tokenAmount from sender ✓

These are different accounts, so no double-counting.

### DEPOSIT_CLAIMED check

Sampled 3 recent DEPOSIT_CLAIMED txs explicitly:

```
0x39e5fe...  records: 1   DEPOSIT_CLAIMED only
0x009888...  records: 1   DEPOSIT_CLAIMED only
0x6cc7da...  records: 1   DEPOSIT_CLAIMED only
```

DEPOSIT_CLAIMED does **not** co-emit a TRANSFER_IN at the indexer level (the
underlying ERC-20 mint event is filtered out by the indexer). Same for
REDEEM_CLAIMED.

### Verdict

Holder count, top-10 share, Gini, HHI numbers are all correct. No code change.

---

## Finding 3: BUIDL multi-chain registry

### Evidence

BlackRock BUIDL was launched on Ethereum (March 2024) and expanded to
Aptos, Arbitrum, Avalanche, Optimism, and Polygon (November 2024).

Addresses confirmed by external sources:

| Chain | Address | Source |
|---|---|---|
| Ethereum | `0x7712c34205737192402172409a8F7ccef8aA2AEc` | Etherscan |
| Arbitrum | `0xA6525Ae43eDCd03dC08E775774dCAbd3bb925872` | The Block |
| **Polygon** | `0x2893Ef551B6dD69F661Ac00F11D93E5Dc5Dc0e99` | PolygonScan |
| Aptos | `0x4de5876d8a8e2be7af6af9f3ca94d9e4fafb24b5f4a5848078d8eb08f08e808a` | (non-EVM, off-chain) |
| Avalanche | (pending verification) | — |
| Optimism | (pending verification) | — |

### Fix applied

Polygon address added to `RWA_PRODUCTS.buidl.deployments`. Avalanche and
Optimism remain in `off_chain_supply` for now.

---

## Remaining audit questions (not addressed in this round)

- **PAXG/XAUt > RWA.xyz reference by 2-4×** — gold spot moved or refs are stale
- **OUSG NAV $112.5 hardcoded** — need on-chain oracle source
- **`migrated_amount_usd` naming** — should be `coheld_usd`
- **Reference TVL `as_of` field** — not in registry, age is invisible
- **Cohort month-boundary timezone** — uses naive `slice(0,7)`
- **Tinlake flow tracking** — still 0, same fix needed as JAAA

These move to Phase 3.
