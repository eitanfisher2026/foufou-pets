const VERDICT_LABELS = {
  likely_same: 'דמיון חזותי גבוה',
  possibly_same: 'דמיון חזותי אפשרי',
};

/**
 * Informational, dismiss-only popup listing every notable AI photo-
 * similarity verdict found during one scan action - rendered by
 * useVisualMatchAlert(). Never blocks anything: by the time this shows, the
 * result is already saved on the match itself, this is purely an alert so
 * a promising visual match isn't missed among everything else a scan
 * touches.
 */
export default function VisualMatchAlertDialog({ matches, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-lg font-bold text-slate-800">🔎 השוואת תמונות AI מצאה דמיון</h2>
        <p className="mb-3 text-sm text-slate-600">
          בנוסף להתאמה לפי הפרטים שמולאו, ה-AI השווה גם את התמונות במקרים הבאים - כדאי לבדוק ידנית:
        </p>
        <div className="mb-4 max-h-80 space-y-2 overflow-y-auto">
          {matches.map((m, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">
                {VERDICT_LABELS[m.verdict] || m.verdict} · {m.label}
              </p>
              <p className="mt-1 text-amber-800">{m.explanation}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white"
        >
          הבנתי
        </button>
      </div>
    </div>
  );
}
