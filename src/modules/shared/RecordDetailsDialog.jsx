/**
 * Read-only popup listing every field captured for a record, so the user
 * can see the full picture without switching into the editable form (which
 * implies "I might change something" rather than "let me just look").
 * `sections` is [{ title, rows: [{ label, value }] }] - grouped and ordered
 * to match the edit form's own bordered sections, so the same information
 * always appears in the same place whether you're looking or editing.
 * Falsy row values, and sections left with no visible rows, are skipped
 * automatically. `photos`, if given, renders every photo (not just the main
 * one shown on the record's summary view) as a horizontally-scrollable
 * thumbnail strip - this is the one place besides the edit form where the
 * extra photos are visible.
 */
export default function RecordDetailsDialog({ title, sections, photos, onViewPhoto, onClose }) {
  const visibleSections = sections
    .map((s) => ({ ...s, rows: s.rows.filter((r) => r.value) }))
    .filter((s) => s.rows.length > 0);

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

        {photos && photos.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onViewPhoto?.(p.url)}
                className="shrink-0"
                aria-label="הצגת תמונה"
              >
                <img
                  src={p.url}
                  alt=""
                  className={`h-20 w-20 rounded-lg object-cover bg-slate-50 ${
                    i === 0 ? 'ring-2 ring-amber-400' : 'border border-slate-200'
                  }`}
                />
              </button>
            ))}
          </div>
        )}

        {visibleSections.length === 0 ? (
          <p className="text-sm text-slate-400">אין פרטים נוספים.</p>
        ) : (
          <div className="space-y-4">
            {visibleSections.map((s) => (
              <fieldset key={s.title} className="rounded-xl border border-slate-200 p-3">
                <legend className="px-1 text-xs font-semibold text-slate-500">{s.title}</legend>
                <dl className="space-y-2">
                  {s.rows.map((r) => (
                    <div key={r.label}>
                      <dt className="text-xs font-medium text-slate-500">{r.label}</dt>
                      <dd className="whitespace-pre-wrap text-sm text-slate-800">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </fieldset>
            ))}
          </div>
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
