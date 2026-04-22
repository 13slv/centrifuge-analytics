import type { CohortRow } from "@/lib/types";

/**
 * Cohort retention heatmap. Rows = cohort month. Columns = months since cohort
 * start. Cell = % of initial investors still holding.
 */
export function CohortTable({ cohorts }: { cohorts: CohortRow[] }) {
  if (cohorts.length === 0) {
    return (
      <div className="text-sm text-neutral-500">
        Not enough investor history to compute cohorts.
      </div>
    );
  }

  const maxOffset = Math.max(...cohorts.map((c) => c.retention.length - 1));
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  const bg = (pct: number) => {
    // 0 → dark neutral, 1 → violet
    const alpha = Math.min(1, pct);
    return `rgba(124, 92, 255, ${0.05 + alpha * 0.75})`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="text-xs tabular-nums">
        <thead className="text-neutral-500">
          <tr>
            <th className="text-left px-2 py-1 font-normal">Cohort</th>
            <th className="text-right px-2 py-1 font-normal">n</th>
            {offsets.map((o) => (
              <th key={o} className="text-center px-2 py-1 font-normal">
                M+{o}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort}>
              <td className="px-2 py-1 text-neutral-400">{c.cohort}</td>
              <td className="px-2 py-1 text-right text-neutral-500">{c.initial_investors}</td>
              {offsets.map((o) => {
                const r = c.retention[o];
                if (!r) return <td key={o} className="px-2 py-1" />;
                const pct = c.initial_investors > 0 ? r.surviving / c.initial_investors : 0;
                return (
                  <td
                    key={o}
                    className="px-2 py-1 text-center"
                    style={{ background: bg(pct), color: pct > 0.4 ? "#fff" : "#aaa" }}
                  >
                    {(pct * 100).toFixed(0)}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-neutral-600 mt-2">
        Cell = % of investors from that cohort still holding a non-dust balance in the pool.
      </p>
    </div>
  );
}
