import { useEffect, useState } from 'react';

/**
 * Shown while the screenshot AI extraction is running (typically 15-30s),
 * so the user can see it's actively working rather than stuck.
 */
export default function AnalyzingIndicator() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-2">
      <p className="mb-1 text-sm text-slate-500">קוראים את התמונה... ({seconds} שניות)</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full w-1/3 animate-indeterminate rounded-full bg-slate-600" />
      </div>
    </div>
  );
}
