import { normalizeVisualVerdict } from '../matching/matchingEngine.js';

// Same four-level scale as the field-based confidence badge (see
// CONFIDENCE_BUCKETS in matchingEngine.js) - "how likely is it these are the
// same animal", from the AI's own photo read instead of the compared
// fields. normalizeVisualVerdict handles a match checked before this scale
// existed (old likely_same/possibly_same/unclear/likely_different strings).
const VERDICT_META = {
  high: { label: 'AI: דמיון חזותי גבוה', className: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  medium: { label: 'AI: דמיון חזותי בינוני', className: 'border-amber-300 bg-amber-50 text-amber-900' },
  low: { label: 'AI: דמיון חזותי נמוך', className: 'border-orange-300 bg-orange-50 text-orange-900' },
  noMatch: { label: 'AI: בוודאות לא אותה חיה', className: 'border-rose-300 bg-rose-50 text-rose-900' },
};

/**
 * Surfaces the AI photo-comparison result (see comparePhotoSimilarity in
 * functions/index.js) directly on a match, wherever it's shown - a match
 * card only ever displayed the field-based `reasons` list, so the whole
 * point of running this check was invisible unless someone happened to
 * catch the transient alert popup. Shown for every verdict, not just the
 * notable ones, for the same reason the field breakdown shows skipped
 * fields too - "checked, came back low-confidence" is a real, useful
 * answer, not something to hide.
 *
 * `disqualified` (pass match.status === REPORT_STATUS.NO_MATCH_PHOTO) marks
 * whether THIS verdict actually zeroed the match's score, per whatever
 * photoDisqualifyThreshold was configured at check time - that can differ
 * from what the verdict bucket alone would suggest if the threshold changes
 * later, so it's passed in rather than re-derived here.
 */
export default function VisualSimilarityNote({ visualSimilarity, disqualified }) {
  if (!visualSimilarity) return null;
  const verdict = normalizeVisualVerdict(visualSimilarity.verdict);
  const meta = VERDICT_META[verdict] || VERDICT_META.low;
  const className = disqualified ? 'border-rose-300 bg-rose-50 text-rose-900' : meta.className;
  return (
    <div className={`mb-2 rounded-lg border p-2 text-xs ${className}`}>
      <p className="font-medium">
        🔎 {meta.label}
        {disqualified && ' - ההתאמה נפסלה'}
      </p>
      <p className="mt-0.5">{visualSimilarity.explanation}</p>
    </div>
  );
}
