/**
 * Small counting progress bar for a list load (see useLoadWithProgress.js) -
 * "טוען... 7/30" with a matching fill bar underneath. `label` defaults to
 * "טוען..." for those existing callers; other long-running actions (e.g.
 * a per-record match scan) pass their own, like "סורק התאמות...".
 */
export default function ProgressBar({ current, total, label = 'טוען...' }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span dir="ltr">
          {current}/{total}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
