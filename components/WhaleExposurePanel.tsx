import { WHALES, totalWhaleHoldingsUsd } from "@/lib/rwa-whales";
import { formatUsd } from "@/lib/data";

export function WhaleExposurePanel({
  totalRwaTvl,
}: {
  totalRwaTvl: number;
}) {
  const totalWhale = totalWhaleHoldingsUsd();
  const pctOfMarket = totalRwaTvl > 0 ? totalWhale / totalRwaTvl : 0;

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Tracked anchor wallets" value={WHALES.length.toString()} />
        <Stat label="Anchor capital under tracking" value={formatUsd(totalWhale)} />
        <Stat
          label="% of total RWA market"
          value={`${(pctOfMarket * 100).toFixed(1)}%`}
        />
      </div>

      {WHALES.map((w) => (
        <div key={w.address} className="mb-4 border border-neutral-900 rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-neutral-950 border-b border-neutral-900">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <span className="font-medium">{w.label}</span>
                <span className="ml-2 text-xs text-neutral-500">{w.org}</span>
              </div>
              <a
                href={`https://etherscan.io/address/${w.address}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-neutral-500 hover:text-violet-400"
              >
                {w.address.slice(0, 8)}…{w.address.slice(-6)}
              </a>
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              Controller: {w.controller}
            </div>
            {w.notes && <div className="text-xs text-neutral-600 mt-1">{w.notes}</div>}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-950 text-neutral-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-normal">Product</th>
                <th className="text-right px-3 py-2 font-normal">Amount</th>
                <th className="text-right px-3 py-2 font-normal">Share of product</th>
              </tr>
            </thead>
            <tbody>
              {w.holdings
                .sort((a, b) => b.amount_usd - a.amount_usd)
                .map((h) => (
                  <tr key={h.product_slug} className="border-t border-neutral-900">
                    <td className="px-3 py-2 text-neutral-300 uppercase">
                      {h.product_slug}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatUsd(h.amount_usd)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        h.share_of_product >= 0.5
                          ? "text-rose-400"
                          : h.share_of_product >= 0.2
                            ? "text-amber-400"
                            : "text-neutral-400"
                      }`}
                    >
                      {(h.share_of_product * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
        Holdings are sampled from on-chain reads + governance proposals; refreshed manually when
        significant rebalancings occur. Share-of-product &gt;50% (red) = the product is structurally
        dependent on this one allocator. Sprint D: auto-refresh + add Ethena, Aave, Frax, Usual.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-900 rounded-md px-3 py-2 bg-neutral-950">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
