import type { DailyFlow, LargeEvent } from "@/lib/types";

const fmt = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

type Item = LargeEvent & { date: string };

export function EventsList({
  flows,
  limit = 12,
  chain = "ethereum",
}: {
  flows: DailyFlow[];
  limit?: number;
  chain?: string;
}) {
  const all: Item[] = [];
  for (const f of flows) {
    for (const e of f.large_events) all.push({ ...e, date: f.date });
  }
  all.sort((a, b) => b.amount_usd - a.amount_usd);
  const top = all.slice(0, limit);

  if (top.length === 0) {
    return (
      <div className="text-sm text-neutral-500">
        No pool-level deposit/redeem events captured in the window.
      </div>
    );
  }

  const explorer =
    chain === "arbitrum"
      ? "https://arbiscan.io/tx/"
      : chain === "base"
        ? "https://basescan.org/tx/"
        : "https://etherscan.io/tx/";

  return (
    <div className="border border-neutral-900 rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-950 text-neutral-400">
          <tr>
            <th className="text-left px-3 py-2 font-normal">Date</th>
            <th className="text-left px-3 py-2 font-normal">Type</th>
            <th className="text-right px-3 py-2 font-normal">Amount</th>
            <th className="text-left px-3 py-2 font-normal">Account</th>
            <th className="text-left px-3 py-2 font-normal">Tx</th>
          </tr>
        </thead>
        <tbody>
          {top.map((e, i) => (
            <tr key={i} className="border-t border-neutral-900">
              <td className="px-3 py-2 text-neutral-400">{e.date}</td>
              <td className="px-3 py-2">
                <span
                  className={
                    e.type === "deposit"
                      ? "text-emerald-400"
                      : e.type === "redeem"
                        ? "text-rose-400"
                        : "text-neutral-400"
                  }
                >
                  {e.type}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(e.amount_usd)}</td>
              <td className="px-3 py-2 font-mono text-xs text-neutral-500">
                {e.account.slice(0, 6)}…{e.account.slice(-4)}
              </td>
              <td className="px-3 py-2">
                <a
                  href={`${explorer}${e.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-500 hover:text-violet-400 font-mono"
                >
                  {e.txHash.slice(0, 8)}…
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
