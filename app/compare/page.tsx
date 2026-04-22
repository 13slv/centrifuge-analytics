import Link from "next/link";
import { getDataset } from "@/lib/data.server";
import { CompareView } from "@/components/CompareView";

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
      <p className="text-sm text-neutral-500 mb-6">
        Pick up to 3 pools to overlay TVL and APY.
      </p>
      <CompareView
        pools={pools}
        histories={histories}
        poolFlows={poolFlows ?? []}
        poolHolders={poolHolders ?? []}
      />
    </main>
  );
}
