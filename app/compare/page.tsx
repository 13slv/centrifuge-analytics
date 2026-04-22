import Link from "next/link";
import { getDataset } from "@/lib/data.server";
import { CompareView } from "@/components/CompareView";
import { SectionNote } from "@/components/SectionNote";

export const revalidate = 3600;

export default async function ComparePage() {
  const { pools, histories, poolFlows, poolHolders } = await getDataset();
  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/" className="hover:text-violet-400">
          ← overview
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold mb-2">Compare pools</h1>
      <SectionNote
        read="Pick up to 3 pools from the chip list. TVL chart overlays absolute USD values — bigger pools will visually dominate. APY chart is the 30-day annualised yield — same scale regardless of pool size. Snapshot table shows latest TVL / APY / holder count / concentration side-by-side."
        insight="Useful combos: JTRSY vs JAAA (T-Bills vs CLO) to see how investors allocate between risk buckets; Treasury Fund vs DeFi Treasury Token to see wrapped vs native exposure; any two pools of the same asset class to compare issuers."
      />
      <div className="mb-6" />
      <CompareView
        pools={pools}
        histories={histories}
        poolFlows={poolFlows ?? []}
        poolHolders={poolHolders ?? []}
      />
    </main>
  );
}
