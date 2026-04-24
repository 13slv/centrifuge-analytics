/**
 * Static registry of RWA tokens across the main issuers.
 *
 * Prices here are "last known NAV" — for daily runs we update from RWA.xyz +
 * on-chain oracles, but the registry defaults make the pipeline runnable from
 * cold. All share tokens are USD-denominated (pegged or yield-accruing); for
 * commodities, the unit price is stored.
 */
export type RwaCategory =
  | "t_bill"
  | "mmf"
  | "credit"
  | "commodity"
  | "equity"
  | "structured";

export type RwaProduct = {
  slug: string;
  name: string;
  symbol: string;
  issuer: string;
  issuerSlug: string;
  category: RwaCategory;
  chain: "ethereum";
  address: `0x${string}`;
  decimals: number;
  /** Approx NAV/price in USD. Refreshed daily; default is the last known value. */
  price_usd: number;
  /** Notes per product (yield mechanics, fund wrapper etc.) */
  notes?: string;
  launched?: string;
  /** Deployed block, used as lower bound for backfills. */
  deployBlock?: number;
};

export const RWA_PRODUCTS: RwaProduct[] = [
  // -------- Tokenized T-Bills / MMF --------
  {
    slug: "buidl",
    name: "BlackRock USD Institutional Digital Liquidity Fund",
    symbol: "BUIDL",
    issuer: "BlackRock + Securitize",
    issuerSlug: "securitize",
    category: "mmf",
    chain: "ethereum",
    address: "0x7712c34205737192402172409a8F7ccef8aA2AEc",
    decimals: 6,
    price_usd: 1.0,
    notes:
      "Rebasing share: yield accrues as BUIDL-I distribution tokens, share price stays at $1.",
    launched: "2024-03-20",
  },
  {
    slug: "ousg",
    name: "Ondo Short-Term US Government Bond Fund",
    symbol: "OUSG",
    issuer: "Ondo",
    issuerSlug: "ondo",
    category: "t_bill",
    chain: "ethereum",
    address: "0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92",
    decimals: 18,
    price_usd: 112.5, // NAV grows; placeholder, refreshed by ETL
    notes: "Wraps BUIDL primarily; NAV-appreciating ERC-20.",
    launched: "2023-01-30",
  },
  {
    slug: "usdy",
    name: "Ondo US Dollar Yield",
    symbol: "USDY",
    issuer: "Ondo",
    issuerSlug: "ondo",
    category: "t_bill",
    chain: "ethereum",
    address: "0x96F6eF951840721AdBF46Ac996b59E0235CB985C",
    decimals: 18,
    price_usd: 1.12,
    notes: "Yield-bearing note; appreciates vs USD. Non-US retail-eligible.",
    launched: "2023-08-31",
  },
  {
    slug: "ustb",
    name: "Superstate Short Duration US Government Securities Fund",
    symbol: "USTB",
    issuer: "Superstate",
    issuerSlug: "superstate",
    category: "t_bill",
    chain: "ethereum",
    address: "0x43415eB6ff9DB7E26A15b704e7A3eDCe97d31C4e",
    decimals: 6,
    price_usd: 10.7,
    notes: "SEC-registered (1940 Act) fund; US qualified purchaser only.",
    launched: "2024-02-21",
  },
  {
    slug: "uscc",
    name: "Superstate Crypto Carry Fund",
    symbol: "USCC",
    issuer: "Superstate",
    issuerSlug: "superstate",
    category: "structured",
    chain: "ethereum",
    address: "0x14d60E7FDC0D71d8611742720E4C50E7a974020c",
    decimals: 6,
    price_usd: 10.1,
    notes: "BTC/ETH basis + T-Bill yield; US qualified purchaser.",
    launched: "2024-06-28",
  },
  {
    slug: "usyc",
    name: "Hashnote Short Duration Yield Fund",
    symbol: "USYC",
    issuer: "Hashnote / Circle",
    issuerSlug: "hashnote",
    category: "t_bill",
    chain: "ethereum",
    address: "0x136471a34f6ef19fE571EFFC1CA711fdb8E49f2b",
    decimals: 6,
    price_usd: 1.11,
    notes: "Reverse-repo + T-Bill portfolio. Circle acquired in 2025.",
    launched: "2023-09-29",
  },
  // -------- Private credit --------
  {
    slug: "syrup-usdc",
    name: "Maple Syrup USDC",
    symbol: "syrupUSDC",
    issuer: "Maple Finance",
    issuerSlug: "maple",
    category: "credit",
    chain: "ethereum",
    address: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b",
    decimals: 6,
    price_usd: 1.15,
    notes: "Overcollateralized loans to crypto institutions. 4626 vault.",
    launched: "2024-09-18",
  },
  // -------- Commodity --------
  {
    slug: "paxg",
    name: "PAX Gold",
    symbol: "PAXG",
    issuer: "Paxos",
    issuerSlug: "paxos",
    category: "commodity",
    chain: "ethereum",
    address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78",
    decimals: 18,
    price_usd: 4000, // per token = per 1 troy oz gold; refreshed daily
    notes: "1 PAXG = 1 troy oz of LBMA-certified gold.",
    launched: "2019-09-05",
  },
  {
    slug: "xaut",
    name: "Tether Gold",
    symbol: "XAUt",
    issuer: "Tether",
    issuerSlug: "tether",
    category: "commodity",
    chain: "ethereum",
    address: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
    decimals: 6,
    price_usd: 4000,
    notes: "1 XAUt = 1 troy oz of gold; stored in Swiss vaults.",
    launched: "2020-01-23",
  },
];

export const ISSUER_META: Record<
  string,
  { name: string; website?: string; founded?: string }
> = {
  securitize: {
    name: "Securitize (BlackRock)",
    website: "https://securitize.io",
    founded: "2017",
  },
  ondo: { name: "Ondo Finance", website: "https://ondo.finance", founded: "2021" },
  superstate: {
    name: "Superstate",
    website: "https://superstate.com",
    founded: "2023",
  },
  hashnote: { name: "Hashnote / Circle", website: "https://hashnote.com", founded: "2022" },
  centrifuge: { name: "Centrifuge / Anemoy", website: "https://centrifuge.io", founded: "2017" },
  maple: { name: "Maple Finance", website: "https://maple.finance", founded: "2019" },
  paxos: { name: "Paxos", website: "https://paxos.com", founded: "2012" },
  tether: { name: "Tether", website: "https://tether.to", founded: "2014" },
  franklin: {
    name: "Franklin Templeton",
    website: "https://www.franklintempleton.com",
    founded: "1947",
  },
  wisdomtree: { name: "WisdomTree", website: "https://wisdomtree.com", founded: "2006" },
  backed: { name: "Backed Finance", website: "https://backed.fi", founded: "2021" },
};

export const CATEGORY_LABELS: Record<RwaCategory, string> = {
  t_bill: "T-Bills",
  mmf: "Money Market Fund",
  credit: "Private Credit",
  commodity: "Commodity",
  equity: "Equity",
  structured: "Structured",
};
