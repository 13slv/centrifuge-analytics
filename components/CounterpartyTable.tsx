import {
  COUNTERPARTY,
  findSharedProviders,
  type ServiceProviders,
} from "@/lib/rwa-counterparty";
import { ISSUER_META } from "@/lib/rwa-registry";

const FIELD_ORDER: (keyof ServiceProviders)[] = [
  "jurisdiction",
  "regulator",
  "custodian",
  "fund_admin",
  "transfer_agent",
  "auditor",
  "oracle",
];

const FIELD_LABEL: Record<keyof ServiceProviders, string> = {
  jurisdiction: "Jurisdiction",
  regulator: "Regulator",
  custodian: "Custodian",
  fund_admin: "Fund admin",
  transfer_agent: "Transfer agent",
  auditor: "Auditor",
  legal_counsel: "Legal",
  oracle: "Oracle / NAV",
  prime_broker: "Prime broker",
};

export function CounterpartyTable() {
  const issuers = Object.keys(COUNTERPARTY);
  const shared = findSharedProviders();

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-xs tabular-nums w-full">
          <thead className="text-neutral-500">
            <tr>
              <th className="text-left px-2 py-2 font-normal">Field</th>
              {issuers.map((i) => (
                <th key={i} className="text-left px-2 py-2 font-normal whitespace-nowrap">
                  {ISSUER_META[i]?.name?.split("(")[0]?.trim() ?? i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELD_ORDER.map((field) => (
              <tr key={field} className="border-t border-neutral-900">
                <td className="px-2 py-2 text-neutral-400 whitespace-nowrap">
                  {FIELD_LABEL[field]}
                </td>
                {issuers.map((i) => {
                  const v = COUNTERPARTY[i]?.[field];
                  const isShared = shared.some(
                    (s) => s.field === field && s.provider === v?.split("(")[0]?.trim(),
                  );
                  return (
                    <td
                      key={i}
                      className={`px-2 py-2 text-neutral-300 ${
                        isShared ? "bg-amber-950/40 text-amber-300" : ""
                      }`}
                    >
                      {v ?? <span className="text-neutral-700">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shared.length > 0 && (
        <div className="mt-4 text-xs text-neutral-500">
          <span className="text-amber-400">●</span> Highlighted cells = provider serves multiple
          issuers (concentration risk):
          <ul className="mt-1 space-y-0.5 ml-4">
            {shared.map((s, i) => (
              <li key={i}>
                <span className="text-neutral-400">{FIELD_LABEL[s.field]}</span>:{" "}
                <span className="text-neutral-300">{s.provider}</span> →{" "}
                {s.issuers.map((iss) => ISSUER_META[iss]?.name?.split(" ")[0] ?? iss).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
