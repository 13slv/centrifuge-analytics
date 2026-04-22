import Link from "next/link";
import type { CrossPoolOverlap, Pool } from "@/lib/types";

const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export function CrossPoolOverlapList({
  overlap,
  pools,
  limit = 10,
}: {
  overlap: CrossPoolOverlap[];
  pools: Pool[];
  limit?: number;
}) {
  const idMap = new Map(pools.map((p) => [p.id, p]));
  const top = overlap
    .filter((o) => o.shared_investors >= 2)
    .slice(0, limit);

  if (top.length === 0) {
    return (
      <div className="text-sm text-neutral-500">
        No significant investor overlap captured yet.
      </div>
    );
  }

  return (
    <div className="border border-neutral-900 rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-950 text-neutral-400">
          <tr>
            <th className="text-left px-3 py-2 font-normal">Pool A</th>
            <th className="text-left px-3 py-2 font-normal">Pool B</th>
            <th className="text-right px-3 py-2 font-normal">Shared</th>
            <th className="text-right px-3 py-2 font-normal">Co-held</th>
          </tr>
        </thead>
        <tbody>
          {top.map((o, i) => {
            const a = idMap.get(o.poolA);
            const b = idMap.get(o.poolB);
            return (
              <tr key={i} className="border-t border-neutral-900">
                <td className="px-3 py-2">
                  {a ? (
                    <Link
                      href={`/pools/${encodeURIComponent(a.id)}`}
                      className="hover:text-violet-400"
                    >
                      {a.shortName || a.name}
                    </Link>
                  ) : (
                    <span className="text-neutral-500">{o.poolA}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {b ? (
                    <Link
                      href={`/pools/${encodeURIComponent(b.id)}`}
                      className="hover:text-violet-400"
                    >
                      {b.shortName || b.name}
                    </Link>
                  ) : (
                    <span className="text-neutral-500">{o.poolB}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{o.shared_investors}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                  {o.migrated_amount_usd > 0 ? fmtUsd(o.migrated_amount_usd) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
