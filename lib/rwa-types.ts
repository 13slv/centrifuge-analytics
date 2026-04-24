import type { RwaCategory } from "./rwa-registry";

export type RwaSnapshot = {
  slug: string;
  name: string;
  symbol: string;
  issuer: string;
  issuerSlug: string;
  category: RwaCategory;
  chain: string;
  address: string;
  decimals: number;
  supply: number; // human-readable
  price_usd: number;
  tvl_usd: number;
  rwaxyz_tvl_usd?: number | null;
  /** Δ (our - rwa.xyz) / rwa.xyz as a fraction. */
  tvl_delta_pct?: number | null;
  notes?: string;
  launched?: string;
};

export type IssuerRollup = {
  slug: string;
  name: string;
  products: number;
  tvl_usd: number;
  categories: RwaCategory[];
};

export type RwaDataset = {
  generatedAt: string;
  products: RwaSnapshot[];
  issuers: IssuerRollup[];
  totals: {
    tvl_usd: number;
    products: number;
    issuers: number;
    by_category: Record<string, number>;
  };
};
