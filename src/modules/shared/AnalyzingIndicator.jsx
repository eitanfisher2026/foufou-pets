import { useEffect, useState } from 'react';

/**
 * Shown while some single AI call is running (screenshot extraction,
 * typically 15-30s; a single match recheck's photo comparison, which can
 * be just as slow if the active provider is cold), so the user can see
 * it's actively working rather than stuck. onCancel is optional - when
 * given, lets the user stop waiting instead. This only stops the wait, not
 * the underlying request: the Firebase callable SDK has no way to actually
 * abort an in-flight call, so the AI cost for this attempt is already
 * committed either way - cancelling just means the result gets thrown away
 * instead of applied.
 *
 * `note`, when given, is a second line under the elapsed-seconds counter -
 * used for a provider-specific caution (e.g. SigLIP2's cold-start wait)
 * that wouldn't be true for every caller of this same component, so it's
 * never baked in here as a default.
 */
export default function AnalyzingIndicator({ onCancel, label = 'קוראים את התמונה...', note }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {label} ({seconds} שניות)
        </p>
        {onCancel && (
          <button type="button" onClick={onCancel} className="shrink-0 text-xs text-slate-500 underline">
            ביטול
          </button>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full w-1/3 animate-indeterminate rounded-full bg-slate-600" />
      </div>
      {note && <p className="mt-1 text-xs text-amber-700">{note}</p>}
    </div>
  );
}
