import type { Anomaly } from "@/lib/anomalies";

const SEVERITY_RANK: Record<Anomaly["severity"], number> = { error: 3, warn: 2, info: 1 };
const SEVERITY_COLOR: Record<Anomaly["severity"], string> = {
  error: "bg-rose-950 border-rose-700 text-rose-300",
  warn: "bg-amber-950 border-amber-700 text-amber-300",
  info: "bg-neutral-900 border-neutral-700 text-neutral-300",
};

const SEVERITY_DOT: Record<Anomaly["severity"], string> = {
  error: "bg-rose-500",
  warn: "bg-amber-400",
  info: "bg-emerald-500",
};

export function DataQualityBadge({
  generatedAt,
  anomalies,
}: {
  generatedAt: string;
  anomalies: Anomaly[];
}) {
  const ageH = (Date.now() - new Date(generatedAt).getTime()) / 3_600_000;
  const ageStr = ageH < 1 ? `${(ageH * 60).toFixed(0)}m` : `${ageH.toFixed(1)}h`;
  const top: Anomaly["severity"] = anomalies.length === 0
    ? "info"
    : (anomalies.reduce((s, a) =>
        SEVERITY_RANK[a.severity] > SEVERITY_RANK[s] ? a.severity : s,
        "info" as Anomaly["severity"],
      ));

  const errors = anomalies.filter((a) => a.severity === "error").length;
  const warns = anomalies.filter((a) => a.severity === "warn").length;
  const infos = anomalies.filter((a) => a.severity === "info").length;

  return (
    <details className={`rounded-md border px-3 py-2 text-xs ${SEVERITY_COLOR[top]}`}>
      <summary className="cursor-pointer flex items-center gap-2 select-none">
        <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[top]}`} />
        <span>updated {ageStr} ago</span>
        {anomalies.length > 0 ? (
          <span className="ml-auto">
            {errors > 0 && <span className="text-rose-300 font-medium">{errors}E</span>}
            {warns > 0 && <span className="ml-2 text-amber-300">{warns}W</span>}
            {infos > 0 && <span className="ml-2 text-neutral-400">{infos}i</span>}
          </span>
        ) : (
          <span className="ml-auto text-neutral-500">no anomalies</span>
        )}
      </summary>
      {anomalies.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {anomalies
            .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
            .map((a, i) => (
              <li key={i} className="flex gap-2 leading-snug">
                <span className={`inline-block w-1.5 h-1.5 mt-1.5 rounded-full ${SEVERITY_DOT[a.severity]} flex-shrink-0`} />
                <span>
                  <span className="font-medium">{a.message}</span>
                  {a.context && <span className="text-neutral-500"> — {a.context}</span>}
                </span>
              </li>
            ))}
        </ul>
      )}
    </details>
  );
}
