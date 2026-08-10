import { useEffect, useState } from 'react';

/**
 * Shown while the screenshot AI extraction is running (typically 15-30s),
 * so the user can see it's actively working rather than stuck. onCancel is
 * optional - when given, lets the user stop waiting and pick a different
 * photo instead. This only stops the wait, not the underlying request: the
 * Firebase callable SDK has no way to actually abort an in-flight call, so
 * the AI cost for this attempt is already committed either way - cancelling
 * just means the result gets thrown away instead of applied.
 */
export default function AnalyzingIndicator({ onCancel }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">קוראים את התמונה... ({seconds} שניות)</p>
        {onCancel && (
          <button type="button" onClick={onCancel} className="shrink-0 text-xs text-slate-500 underline">
            ביטול
          </button>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full w-1/3 animate-indeterminate rounded-full bg-slate-600" />
      </div>
    </div>
  );
}
