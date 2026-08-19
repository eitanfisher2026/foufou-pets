const VERDICT_META = {
  likely_same: { label: 'AI: דמיון חזותי גבוה', className: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  possibly_same: { label: 'AI: דמיון חזותי אפשרי', className: 'border-amber-300 bg-amber-50 text-amber-900' },
  unclear: { label: 'AI: השוואת התמונות לא הייתה חד-משמעית', className: 'border-slate-300 bg-slate-50 text-slate-600' },
  likely_different: { label: 'AI: נראות שונות בתמונה', className: 'border-slate-300 bg-slate-50 text-slate-500' },
};

/**
 * Surfaces the AI photo-comparison result (see comparePhotoSimilarity in
 * functions/index.js) directly on a match, wherever it's shown - a match
 * card only ever displayed the field-based `reasons` list, so the whole
 * point of running this check was invisible unless someone happened to
 * catch the transient alert popup. Shown for every verdict, not just the
 * notable ones, for the same reason the field breakdown shows skipped
 * fields too - "checked, came back inconclusive" is a real, useful answer,
 * not something to hide.
 */
export default function VisualSimilarityNote({ visualSimilarity }) {
  if (!visualSimilarity) return null;
  const meta = VERDICT_META[visualSimilarity.verdict] || VERDICT_META.unclear;
  return (
    <div className={`mb-2 rounded-lg border p-2 text-xs ${meta.className}`}>
      <p className="font-medium">🔎 {meta.label}</p>
      <p className="mt-0.5">{visualSimilarity.explanation}</p>
    </div>
  );
}
