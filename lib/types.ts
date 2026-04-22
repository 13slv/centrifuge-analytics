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

export type PoolHistory = {
  poolId: string;
  series: TvlPoint[];
};

export type Dataset = {
  generatedAt: string;
  startDate: string;
  endDate: string;
  pools: Pool[];
  histories: PoolHistory[];
};
