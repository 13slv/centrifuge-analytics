export type Chain =
  | "ethereum"
  | "base"
  | "arbitrum"
  | "optimism"
  | "plume"
  | "avalanche"
  | "bnb"
  | "hyperevm";

export type PoolVersion = "tinlake_v2" | "cfg_v3";

export type PoolStatus = "active" | "closed" | "upcoming";

export type Tranche = {
  id: string;
  address?: string;
  symbol: string;
  seniority: "senior" | "junior" | "single";
  decimals: number;
};

export type Pool = {
  id: string;
  version: PoolVersion;
  chain: Chain;
  name: string;
  shortName?: string;
  slug?: string;
  issuer?: string;
  assetClass: string;
  currency: string;
  status: PoolStatus;
  createdAt: string;
  createdAtBlock?: number;
  metadataUri?: string;
  description?: string;
  tranches: Tranche[];
  rootAddress?: string;
  reserveAddress?: string;
  assessorAddress?: string;
};

export type TvlPoint = {
  date: string;
  tvl_usd: number;
};

export type ApyPoint = {
  date: string;
  apy: number; // annualized (0.035 = 3.5%), computed from 30d yield on 365 basis
};

export type PoolHistory = {
  poolId: string;
  series: TvlPoint[];
  apySeries?: ApyPoint[];
  /** Latest TVL distributed by chain where the token instance lives. */
  chainTvl?: Record<string, number>;
};

export type LargeEvent = {
  type: "deposit" | "redeem" | "transfer";
  amount_usd: number;
  account: string;
  txHash: string;
};

export type DailyFlow = {
  date: string;
  inflow_usd: number;
  outflow_usd: number;
  yield_usd: number;
  large_events: LargeEvent[];
};

export type PoolFlows = {
  poolId: string;
  flows: DailyFlow[];
};

export type HolderSnapshot = {
  date: string;
  holders: number;
  top10_share: number; // 0..1
  hhi: number; // Herfindahl-Hirschman 0..1
  gini: number; // 0..1
};

export type TopHolder = {
  account: string;
  balance_usd: number;
  share: number; // 0..1
  first_seen: string;
};

export type CohortRow = {
  cohort: string; // YYYY-MM
  initial_investors: number;
  retention: { month_offset: number; surviving: number }[];
};

export type PoolHolders = {
  poolId: string;
  series: HolderSnapshot[];
  top: TopHolder[];
  cohorts: CohortRow[];
};

export type Dataset = {
  generatedAt: string;
  startDate: string;
  endDate: string;
  pools: Pool[];
  histories: PoolHistory[];
  poolFlows?: PoolFlows[];
  poolHolders?: PoolHolders[];
  benchmarks?: {
    ust_3m: { date: string; value: number }[];
    aaa_corp: { date: string; value: number }[];
  };
  crossPoolOverlap?: CrossPoolOverlap[];
};

export type CrossPoolOverlap = {
  poolA: string;
  poolB: string;
  shared_investors: number;
  migrated_amount_usd: number; // shares that moved between the two (rough)
};
