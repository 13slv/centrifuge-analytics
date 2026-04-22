/**
 * Reusable "how to read + insight" note rendered under each chart heading.
 * Kept server-rendered (no client hooks) so it can be used anywhere.
 */
export function SectionNote({
  read,
  insight,
}: {
  read: string;
  insight?: string | null;
}) {
  return (
    <div className="mb-3 text-xs text-neutral-500 leading-relaxed space-y-1">
      <div>
        <span className="text-neutral-400">How to read: </span>
        {read}
      </div>
      {insight && (
        <div>
          <span className="text-violet-400">Insight: </span>
          {insight}
        </div>
      )}
    </div>
  );
}
