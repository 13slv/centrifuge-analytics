/**
 * Known anchor wallets ("whales") and their holdings across RWA products.
 *
 * REGISTRY_VERIFIED_AT: 2026-04-23 (Grove ALM Proxy)
 * Sources:
 *   - Grove ALM Proxy address: vote.sky.money executive (Nov 13 2025) —
 *     "Whitelist Launch Agent 4 ALMProxy on the LitePSM"
 *   - Holdings (BUIDL, JTRSY, JAAA): Etherscan token holders + Centrifuge
 *     V3 indexer at sample time
 *
 * Auto-refresh: rwa-whales-refresh.ts pulls live balanceOf daily for
 * Ethereum-side products. JTRSY/JAAA holdings are pulled from Centrifuge
 * GraphQL (not Alchemy), so they fall back to declared values until
 * scripts/holders.ts updates them.
 */

export type WhaleHolding = {
  product_slug: string;
  amount_usd: number;
  share_of_product: number; // 0..1; share of total product TVL
  source: string;
};

export type WhaleAddress = {
  address: string;
  label: string;
  org: string;
  controller: string; // who controls (DAO / company / multisig)
  notes?: string;
  holdings: WhaleHolding[];
};

export const WHALES: WhaleAddress[] = [
  {
    address: "0x491EDFB0B8b608044e227225C715981a30F3A44E",
    label: "Grove ALM Proxy",
    org: "Sky Ecosystem (ex-MakerDAO)",
    controller: "Sky governance (vote.sky.money)",
    notes:
      "Launch Agent 4 of Sky's Liquidity Layer; deploys USDS reserves into tokenized RWA via governance votes.",
    holdings: [
      { product_slug: "buidl", amount_usd: 983_800_000, share_of_product: 0.59, source: "Etherscan" },
      { product_slug: "jtrsy", amount_usd: 1_292_000_000, share_of_product: 0.85, source: "Centrifuge V3 indexer" },
      { product_slug: "jaaa", amount_usd: 23_600_000, share_of_product: 0.058, source: "Centrifuge V3 indexer" },
    ],
  },
  // Other known whales (seed list — to expand in Sprint D research):
  // - Ethena (USDe collateral pool)
  // - Aave RWA market
  // - Frax sFRAX backing
  // - Usual Money
];

/** Group holdings by product → whale exposure. */
export function whaleExposureByProduct(): Map<
  string,
  { whale: WhaleAddress; holding: WhaleHolding }[]
> {
  const m = new Map<string, { whale: WhaleAddress; holding: WhaleHolding }[]>();
  for (const w of WHALES) {
    for (const h of w.holdings) {
      const arr = m.get(h.product_slug) ?? [];
      arr.push({ whale: w, holding: h });
      m.set(h.product_slug, arr);
    }
  }
  return m;
}

export function totalWhaleHoldingsUsd(): number {
  let t = 0;
  for (const w of WHALES) for (const h of w.holdings) t += h.amount_usd;
  return t;
}
