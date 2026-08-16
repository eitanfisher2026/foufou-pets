/**
 * Read-only popup listing every field captured for a record, so the user
 * can see the full picture without switching into the editable form (which
 * implies "I might change something" rather than "let me just look").
 * `sections` is [{ title, rows: [{ label, value }], startClosed?,
 * keepIfEmpty? }] - grouped and ordered to match the edit form's own
 * bordered sections, so the same information always appears in the same
 * place whether you're looking or editing. Falsy row values are always
 * skipped; a section left with no visible rows is skipped too UNLESS
 * marked `keepIfEmpty` (e.g. "מקור מידע" - the edit form always shows that
 * section so a person can fill it in, so the view should still show it
 * exists even when nothing's been entered yet, instead of silently
 * vanishing only in the read-only view). Every section is collapsible
 * (native <details>, no extra state needed) and open by default, except
 * one marked `startClosed: true` (secondary info - who created the
 * record, when - that should still be reachable but shouldn't compete
 * with the record's own fields for attention). `photos`, if given, renders
 * every photo (not just the main one shown on the record's summary view)
 * as a horizontally-scrollable thumbnail strip - this is the one place
 * besides the edit form where the extra photos are visible.
 */
export default function RecordDetailsDialog({ title, sections, photos, onViewPhoto, onClose }) {
  const visibleSections = sections
    .map((s) => ({ ...s, rows: s.rows.filter((r) => r.value) }))
    .filter((s) => s.rows.length > 0 || s.keepIfEmpty);

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
              <details
                key={s.title}
                className="rounded-xl border border-dotted border-slate-400 p-3"
                open={!s.startClosed}
              >
                <summary className="cursor-pointer px-1 text-xs font-bold text-slate-600">{s.title}</summary>
                {s.rows.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">לא צוין מידע.</p>
                ) : (
                  <dl className="mt-2 space-y-2">
                    {s.rows.map((r) => (
                      <div key={r.label}>
                        <dt className="text-xs font-medium text-slate-500">{r.label}</dt>
                        {typeof r.value === 'string' && /^https?:\/\//.test(r.value) ? (
                          <dd className="text-sm">
                            <a
                              href={r.value}
                              target="_blank"
                              rel="noreferrer"
                              dir="ltr"
                              className="break-all text-blue-700 underline"
                            >
                              {r.value}
                            </a>
                          </dd>
                        ) : (
                          <dd className="whitespace-pre-wrap text-sm text-slate-800" dir={r.dir}>
                            {r.value}
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                )}
              </details>
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
