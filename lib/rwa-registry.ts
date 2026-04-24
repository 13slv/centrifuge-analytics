/**
 * Static registry of RWA tokens across the main issuers.
 *
 * Each product can live on multiple chains; supply is summed across chains.
 * Price is resolved live where possible (ERC-4626 totalAssets, gold spot)
 * and falls back to last-known NAV stored here.
 */
import type { SupportedChain } from "./alchemy";

export type RwaCategory =
  | "t_bill"
  | "mmf"
  | "credit"
  | "commodity"
  | "equity"
  | "structured";

export type ChainDeployment = {
  chain: SupportedChain;
  address: `0x${string}`;
  decimals: number;
};

export type PriceSource =
  | { kind: "static" }
  | { kind: "erc4626"; chain: SupportedChain; address: `0x${string}`; assetDecimals: number }
  | { kind: "gold-spot" };

export type RwaProduct = {
  slug: string;
  name: string;
  symbol: string;
  issuer: string;
  issuerSlug: string;
  category: RwaCategory;
  deployments: ChainDeployment[];
  /** off-chain reported supply (Aptos, Solana etc. — not Alchemy-indexable) in human units. */
  off_chain_supply?: number;
  price_usd: number;
  priceSource: PriceSource;
  /** Reference TVL from RWA.xyz / issuer site, last sampled manually. */
  rwaxyz_tvl_usd: number | null;
  rwaxyz_as_of: string | null;
  notes?: string;
  launched?: string;
};

export const RWA_PRODUCTS: RwaProduct[] = [
  {
    slug: "buidl",
    name: "BlackRock USD Institutional Digital Liquidity Fund",
    symbol: "BUIDL",
    issuer: "BlackRock + Securitize",
    issuerSlug: "securitize",
    category: "mmf",
    deployments: [
      { chain: "ethereum", address: "0x7712c34205737192402172409a8F7ccef8aA2AEc", decimals: 6 },
      { chain: "arbitrum", address: "0xA6525Ae43eDCd03dC08E775774dCAbd3bb925872", decimals: 6 },
      // Polygon, Avalanche, Optimism deployments exist but addresses harder to verify;
      // off_chain_supply captures the gap.
    ],
    off_chain_supply: 1_500_000_000, // residual on Polygon / Avalanche / Optimism / Aptos / Solana
    price_usd: 1.0,
    priceSource: { kind: "static" },
    rwaxyz_tvl_usd: 2_500_000_000,
    rwaxyz_as_of: "2026-04-24",
    notes: "Rebasing share: yield as separate distribution token, NAV stays at $1.",
    launched: "2024-03-20",
  },
  {
    slug: "ousg",
    name: "Ondo Short-Term US Government Bond Fund",
    symbol: "OUSG",
    issuer: "Ondo",
    issuerSlug: "ondo",
    category: "t_bill",
    deployments: [
      { chain: "ethereum", address: "0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92", decimals: 18 },
    ],
    price_usd: 112.5,
    priceSource: { kind: "static" },
    rwaxyz_tvl_usd: 673_000_000,
    rwaxyz_as_of: "2026-04-24",
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
    deployments: [
      { chain: "ethereum", address: "0x96F6eF951840721AdBF46Ac996b59E0235CB985C", decimals: 18 },
      // arbitrum address pending verified checksum — handled via off-chain supply
    ],
    off_chain_supply: 200_000_000, // Arbitrum + Mantle + Solana + Sui + Aptos via LayerZero OFT
    price_usd: 1.12,
    priceSource: { kind: "static" },
    rwaxyz_tvl_usd: 700_000_000,
    rwaxyz_as_of: "2026-04-24",
    notes: "LayerZero OFT — burn/mint between chains keeps total supply consistent.",
    launched: "2023-08-31",
  },
  {
    slug: "ustb",
    name: "Superstate Short Duration US Government Securities Fund",
    symbol: "USTB",
    issuer: "Superstate",
    issuerSlug: "superstate",
    category: "t_bill",
    deployments: [
      { chain: "ethereum", address: "0x43415eB6ff9DB7E26A15b704e7A3eDCe97d31C4e", decimals: 6 },
    ],
    price_usd: 10.7,
    priceSource: { kind: "static" },
    rwaxyz_tvl_usd: 694_000_000,
    rwaxyz_as_of: "2026-04-24",
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
    deployments: [
      { chain: "ethereum", address: "0x14d60E7FDC0D71d8611742720E4C50E7a974020c", decimals: 6 },
    ],
    price_usd: 10.1,
    priceSource: { kind: "static" },
    rwaxyz_tvl_usd: 110_000_000,
    rwaxyz_as_of: "2026-04-24",
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
    deployments: [
      { chain: "ethereum", address: "0x136471a34f6ef19fE571EFFC1CA711fdb8E49f2b", decimals: 6 },
    ],
    off_chain_supply: 2_500_000_000, // Canton chain (Hashnote's enterprise L1) holds majority
    price_usd: 1.11,
    priceSource: { kind: "static" },
    rwaxyz_tvl_usd: 2_900_000_000,
    rwaxyz_as_of: "2026-04-24",
    notes: "Reverse-repo + T-Bill. Circle acquired in 2025; majority of supply on Canton chain.",
    launched: "2023-09-29",
  },
  {
    slug: "syrup-usdc",
    name: "Maple Syrup USDC",
    symbol: "syrupUSDC",
    issuer: "Maple Finance",
    issuerSlug: "maple",
    category: "credit",
    deployments: [
      { chain: "ethereum", address: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b", decimals: 6 },
    ],
    price_usd: 1.15,
    priceSource: {
      kind: "erc4626",
      chain: "ethereum",
      address: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b",
      assetDecimals: 6,
    },
    rwaxyz_tvl_usd: 1_600_000_000,
    rwaxyz_as_of: "2026-04-24",
    notes: "ERC-4626 vault; price = totalAssets / totalSupply.",
    launched: "2024-09-18",
  },
  {
    slug: "paxg",
    name: "PAX Gold",
    symbol: "PAXG",
    issuer: "Paxos",
    issuerSlug: "paxos",
    category: "commodity",
    deployments: [
      { chain: "ethereum", address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78", decimals: 18 },
    ],
    price_usd: 4000,
    priceSource: { kind: "gold-spot" },
    rwaxyz_tvl_usd: 800_000_000,
    rwaxyz_as_of: "2026-04-24",
    notes: "1 PAXG = 1 troy oz LBMA-certified gold.",
    launched: "2019-09-05",
  },
  {
    slug: "xaut",
    name: "Tether Gold",
    symbol: "XAUt",
    issuer: "Tether",
    issuerSlug: "tether",
    category: "commodity",
    deployments: [
      { chain: "ethereum", address: "0x68749665FF8D2d112Fa859AA293F07A622782F38", decimals: 6 },
    ],
    price_usd: 4000,
    priceSource: { kind: "gold-spot" },
    rwaxyz_tvl_usd: 700_000_000,
    rwaxyz_as_of: "2026-04-24",
    notes: "1 XAUt = 1 troy oz of gold; Swiss vaults.",
    launched: "2020-01-23",
  },
];

export const ISSUER_META: Record<
  string,
  { name: string; website?: string; founded?: string }
> = {
  securitize: { name: "Securitize (BlackRock)", website: "https://securitize.io", founded: "2017" },
  ondo: { name: "Ondo Finance", website: "https://ondo.finance", founded: "2021" },
  superstate: { name: "Superstate", website: "https://superstate.com", founded: "2023" },
  hashnote: { name: "Hashnote / Circle", website: "https://hashnote.com", founded: "2022" },
  centrifuge: { name: "Centrifuge / Anemoy", website: "https://centrifuge.io", founded: "2017" },
  maple: { name: "Maple Finance", website: "https://maple.finance", founded: "2019" },
  paxos: { name: "Paxos", website: "https://paxos.com", founded: "2012" },
  tether: { name: "Tether", website: "https://tether.to", founded: "2014" },
};

export const CATEGORY_LABELS: Record<RwaCategory, string> = {
  t_bill: "T-Bills",
  mmf: "Money Market Fund",
  credit: "Private Credit",
  commodity: "Commodity",
  equity: "Equity",
  structured: "Structured",
};
