/**
 * Read-only popup listing every field captured for a record, so the user
 * can see the full picture without switching into the editable form (which
 * implies "I might change something" rather than "let me just look").
 * `rows` is [{ label, value }] - falsy values are skipped automatically.
 */
export default function RecordDetailsDialog({ title, rows, onClose }) {
  const visibleRows = rows.filter((r) => r.value);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-xl leading-none text-slate-400 hover:text-slate-600"
            aria-label="סגירה"
          >
            ✕
          </button>
        </div>

        {visibleRows.length === 0 ? (
          <p className="text-sm text-slate-400">אין פרטים נוספים.</p>
        ) : (
          <dl className="space-y-3">
            {visibleRows.map((r) => (
              <div key={r.label}>
                <dt className="text-xs font-medium text-slate-500">{r.label}</dt>
                <dd className="whitespace-pre-wrap text-sm text-slate-800">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
        >
          סגירה
        </button>
      </div>
    </div>
  );
}
