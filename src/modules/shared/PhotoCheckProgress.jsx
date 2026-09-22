import { useEffect, useState } from 'react';

/**
 * Honest progress for the AI photo-comparison phase of a match check - a
 * real done/total fraction (see checkMatchesForLostCase/
 * checkMatchesForFoundReport/checkSingleMatch in matchingApi.js, which
 * report only the candidates that actually need an AI photo call, not
 * every candidate scored - field scoring is instant and already done by
 * the time this ever renders), plus a live elapsed-seconds counter so a
 * long wait on a single slow call still shows real, truthful movement
 * instead of a bar that races ahead and then just sits still.
 *
 * `isSlowProvider` shows a specific cold-start caution - true only when the
 * self-hosted SigLIP2 provider is the one actually running (see
 * photoCompareProviderKind in matchConfigApi.js). Every other provider
 * (Claude/Gemini/OpenAI/Fireworks/Jina/Voyage) answers in a few seconds, so
 * showing a "this can take 30 seconds" note unconditionally would itself
 * be dishonest for them - a caller passes this only when it's actually true
 * for the provider currently selected.
 */
export default function PhotoCheckProgress({ done, total, isSlowProvider = false }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>משווה תמונות באמצעות AI...</span>
        <span dir="ltr">
          {done}/{total} · {seconds} שניות
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {isSlowProvider && (
        <p className="mt-1 text-xs text-amber-700">
          הספק הנוכחי (SigLIP2, עצמאי) לפעמים לוקח עד כ-30 שניות לטעינה ראשונה לפני שהוא עונה - זה תקין, לא תקוע.
        </p>
      )}
    </div>
  );
}
