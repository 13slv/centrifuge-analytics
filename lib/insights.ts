import type {
  CrossPoolOverlap,
  DailyFlow,
  HolderSnapshot,
  Pool,
  PoolHistory,
  TvlPoint,
} from "./types";
import { formatUsd, currentTvl } from "./data";

function pct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

// ---------- Overview insights ----------

export function totalTvlInsight(total: { date: string; tvl_usd: number }[]): string {
  if (total.length < 2) return "Not enough data yet.";
  const latest = total[total.length - 1].tvl_usd;
  const peak = total.reduce((m, p) => (p.tvl_usd > m.tvl_usd ? p : m), total[0]);
  const dayOf = (d: string) => {
    const [y, m] = d.split("-");
    return `${m}/${y}`;
  };
  // Biggest single-day jump
  let maxJump = { delta: 0, date: "", prev: 0 };
  for (let i = 1; i < total.length; i++) {
    const delta = total[i].tvl_usd - total[i - 1].tvl_usd;
    if (delta > maxJump.delta) {
      maxJump = { delta, date: total[i].date, prev: total[i - 1].tvl_usd };
    }
  }
  const offPeak = peak.tvl_usd - latest;
  const offPeakPct = offPeak / peak.tvl_usd;
  let msg = `Current ${formatUsd(latest)} vs peak ${formatUsd(peak.tvl_usd)} (${dayOf(peak.date)}).`;
  if (offPeakPct > 0.02) msg += ` ${pct(-offPeakPct)} off peak.`;
  if (maxJump.date) {
    msg += ` Biggest step-up: +${formatUsd(maxJump.delta)} on ${maxJump.date} — corresponds to a pool launch or mint event.`;
  }
  return msg;
}

export function assetClassDriftInsight(
  pools: Pool[],
  histories: PoolHistory[],
): string {
  const histMap = new Map(histories.map((h) => [h.poolId, h]));
  const norm = (s: string) =>
    s === "Private credit" ? "Private Credit" : s === "Public credit" ? "Public Credit" : s;

  // Compare class share 90 days ago vs now
  const now = new Map<string, number>();
  const past = new Map<string, number>();
  let nowTotal = 0;
  let pastTotal = 0;
  for (const p of pools) {
    const h = histMap.get(p.id);
    if (!h || h.series.length === 0) continue;
    const cls = norm(p.assetClass);
    const last = h.series[h.series.length - 1].tvl_usd;
    const pastIdx = Math.max(0, h.series.length - 90);
    const pastTvl = h.series[pastIdx].tvl_usd;
    now.set(cls, (now.get(cls) ?? 0) + last);
    past.set(cls, (past.get(cls) ?? 0) + pastTvl);
    nowTotal += last;
    pastTotal += pastTvl;
  }
  if (nowTotal === 0 || pastTotal === 0) return "Not enough history.";
  let winner = { cls: "", delta: 0 };
  let loser = { cls: "", delta: 0 };
  for (const cls of now.keys()) {
    const nowShare = (now.get(cls) ?? 0) / nowTotal;
    const pastShare = (past.get(cls) ?? 0) / pastTotal;
    const delta = nowShare - pastShare;
    if (delta > winner.delta) winner = { cls, delta };
    if (delta < loser.delta) loser = { cls, delta };
  }
  const biggestNow = Array.from(now.entries()).sort((a, b) => b[1] - a[1])[0];
  const biggestShare = biggestNow ? biggestNow[1] / nowTotal : 0;
  const parts: string[] = [];
  if (biggestNow) {
    parts.push(
      `${biggestNow[0]} dominates at ${(biggestShare * 100).toFixed(0)}% of total TVL today.`,
    );
  }
  if (winner.cls && winner.delta > 0.02) {
    parts.push(`${winner.cls} share grew ${pct(winner.delta)} in 90d.`);
  }
  if (loser.cls && loser.delta < -0.02) {
    parts.push(`${loser.cls} lost ${pct(-loser.delta)} share.`);
  }
  return parts.join(" ");
}

export function crossPoolInsight(
  overlap: CrossPoolOverlap[],
  pools: Pool[],
): string {
  if (overlap.length === 0) return "No significant overlap yet.";
  const idMap = new Map(pools.map((p) => [p.id, p]));
  const top = overlap.filter((o) => o.migrated_amount_usd > 1_000_000)[0] ?? overlap[0];
  const a = idMap.get(top.poolA);
  const b = idMap.get(top.poolB);
  const aName = a?.shortName || a?.name || top.poolA;
  const bName = b?.shortName || b?.name || top.poolB;
  const msg =
    top.migrated_amount_usd > 0
      ? `Biggest overlap: ${aName} ↔ ${bName} — ${top.shared_investors} investors holding ${formatUsd(top.migrated_amount_usd)} in both.`
      : `${aName} ↔ ${bName} share ${top.shared_investors} investors (small balances).`;
  const institutional = overlap.filter((o) => o.migrated_amount_usd > 10_000_000).length;
  if (institutional > 0) {
    return `${msg} ${institutional} pool-pair(s) co-held at institutional size (>$10M).`;
  }
  return msg;
}

export function alertsInsight(alertCount: number): string {
  if (alertCount === 0) return "No significant moves in the last 14 days — pools are stable.";
  if (alertCount <= 3) return `${alertCount} minor event(s) in 14d — mostly normal operating noise.`;
  return `${alertCount} notable events in 14d — scan the list for redeems or APY shifts that warrant follow-up.`;
}

export function breakdownInsight(
  rows: { k: string; v: number }[],
  kind: "class" | "chain",
): string {
  const total = rows.reduce((s, r) => s + r.v, 0);
  if (total === 0 || rows.length === 0) return "";
  const top = rows[0];
  const topShare = top.v / total;
  if (kind === "class") {
    return `${top.k} = ${(topShare * 100).toFixed(0)}% of TVL. ${rows.slice(0, 3).length === 1 ? "Single-class dominance" : `Top-3: ${rows.slice(0, 3).map((r) => r.k).join(", ")}.`}`;
  }
  return `${top.k} holds ${(topShare * 100).toFixed(0)}% of TVL (${formatUsd(top.v)}). Centrifuge is still an Ethereum-first protocol — cross-chain expansion mostly unused so far.`;
}

export function poolsTableInsight(
  pools: Pool[],
  histories: PoolHistory[],
): string {
  const histMap = new Map(histories.map((h) => [h.poolId, h]));
  let activeWithTvl = 0;
  let highestApy = { name: "", apy: 0 };
  let zeroTvlActive = 0;
  for (const p of pools) {
    const h = histMap.get(p.id);
    const series = h?.series ?? [];
    const cur = currentTvl(series);
    if (p.status === "active" && cur > 100_000) activeWithTvl++;
    if (p.status === "active" && cur === 0) zeroTvlActive++;
    const apy = h?.apySeries?.[h.apySeries.length - 1]?.apy;
    if (apy != null && cur > 1_000_000 && apy > highestApy.apy) {
      highestApy = { name: p.shortName || p.name, apy };
    }
  }
  const parts: string[] = [];
  parts.push(`${activeWithTvl} pool(s) with meaningful TVL (>${formatUsd(100_000)}).`);
  if (zeroTvlActive > 0) {
    parts.push(
      `${zeroTvlActive} are "active" on paper but empty — newly deployed or yet-to-launch.`,
    );
  }
  if (highestApy.name) {
    parts.push(`Best APY: ${highestApy.name} at ${(highestApy.apy * 100).toFixed(2)}%.`);
  }
  return parts.join(" ");
}

// ---------- Pool-detail insights ----------

export function tvlChartInsight(
  series: TvlPoint[],
  apy: { date: string; apy: number }[],
  benchmark?: { date: string; value: number }[],
  benchmarkLabel?: string,
): string {
  if (series.length === 0) return "No TVL history.";
  const latest = series[series.length - 1];
  const latestApy = apy[apy.length - 1]?.apy;
  const parts: string[] = [];
  if (latestApy != null) {
    if (benchmark && benchmark.length > 0) {
      const b = benchmark[benchmark.length - 1].value;
      const spread = latestApy - b;
      parts.push(
        `APY ${(latestApy * 100).toFixed(2)}% vs ${benchmarkLabel} ${(b * 100).toFixed(2)}% — spread ${pct(spread)}.`,
      );
    } else {
      parts.push(`APY ${(latestApy * 100).toFixed(2)}%.`);
    }
  }
  // Drawdown
  const peak = series.reduce((m, s) => Math.max(m, s.tvl_usd), 0);
  const drawdown = peak > 0 ? (peak - latest.tvl_usd) / peak : 0;
  if (drawdown > 0.05) {
    parts.push(`Currently ${pct(-drawdown)} off peak of ${formatUsd(peak)}.`);
  } else if (latest.tvl_usd === peak) {
    parts.push("At all-time high.");
  }
  return parts.join(" ");
}

export function flowInsight(flows: DailyFlow[]): string {
  if (flows.length === 0) return "No flow data.";
  const totalIn = flows.reduce((s, f) => s + f.inflow_usd, 0);
  const totalOut = flows.reduce((s, f) => s + f.outflow_usd, 0);
  const totalYield = flows.reduce((s, f) => s + f.yield_usd, 0);
  const gross = Math.abs(totalIn) + Math.abs(totalOut) + Math.abs(totalYield);
  if (gross === 0) return "No movement in the period.";
  const yieldShare = Math.abs(totalYield) / gross;
  if (yieldShare > 0.9 && totalIn + totalOut < 100_000) {
    return "Pool-level flow is almost entirely NAV changes (yield). Deposits/redeems happen via admin-side share issuance rather than the ERC-7575 vault path — typical for fully managed RWA funds.";
  }
  if (totalIn > totalOut * 3) {
    return `Net-positive flow: ${formatUsd(totalIn)} in vs ${formatUsd(totalOut)} out. Pool is still actively accepting capital.`;
  }
  if (totalOut > totalIn * 3) {
    return `Net redemption pressure: ${formatUsd(totalOut)} out vs ${formatUsd(totalIn)} in. Worth watching.`;
  }
  return `Balanced: ${formatUsd(totalIn)} in, ${formatUsd(totalOut)} out. Yield portion: ${formatUsd(totalYield)}.`;
}

export function eventsInsight(flows: DailyFlow[]): string {
  const events = flows.flatMap((f) => f.large_events.map((e) => ({ ...e, date: f.date })));
  if (events.length === 0) {
    return "No individual events above the $100K threshold captured in the window.";
  }
  const biggest = events.sort((a, b) => b.amount_usd - a.amount_usd)[0];
  const uniqueAccounts = new Set(events.map((e) => e.account)).size;
  return `${events.length} event(s) above $100K, from ${uniqueAccounts} unique account(s). Biggest single move: ${formatUsd(biggest.amount_usd)} (${biggest.type}) on ${biggest.date}.`;
}

export function holdersInsight(series: HolderSnapshot[]): string {
  if (series.length === 0) return "";
  const latest = series[series.length - 1];
  const top10 = latest.top10_share;
  const gini = latest.gini;

  // Describe concentration regime
  let regime = "";
  if (top10 >= 0.95) regime = "whale-dominated — top-10 own almost everything";
  else if (top10 >= 0.8) regime = "institutional — wide holder base with concentrated heavyweights";
  else if (top10 >= 0.5) regime = "mixed — meaningful long-tail but clear leaders";
  else regime = "broadly distributed";

  const first = series.find((s) => s.holders > 0);
  const growth =
    first && first.holders > 0 ? latest.holders - first.holders : latest.holders;

  return `${regime} (top-10 = ${(top10 * 100).toFixed(0)}%, Gini ${gini.toFixed(2)}). Holder base ${growth >= 0 ? "grew" : "shrank"} by ${Math.abs(growth)} addresses since the pool started being indexed.`;
}

export function cohortInsight(cohorts: { cohort: string; initial_investors: number; retention: { month_offset: number; surviving: number }[] }[]): string {
  if (cohorts.length === 0) return "";
  // Compute average retention at M+3 across cohorts that have ≥3 months of data
  const samples: number[] = [];
  for (const c of cohorts) {
    if (c.retention.length >= 4 && c.initial_investors > 0) {
      samples.push(c.retention[3].surviving / c.initial_investors);
    }
  }
  if (samples.length === 0) {
    return "Pool is too young for 3-month retention cohorts.";
  }
  const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
  if (avg >= 0.8) {
    return `Sticky investor base: average M+3 retention ${(avg * 100).toFixed(0)}% across cohorts — once capital enters, it tends to stay.`;
  }
  if (avg < 0.4) {
    return `High churn: average M+3 retention only ${(avg * 100).toFixed(0)}% — investors rotating out within 3 months.`;
  }
  return `Moderate stickiness: M+3 retention averages ${(avg * 100).toFixed(0)}% across cohorts.`;
}
