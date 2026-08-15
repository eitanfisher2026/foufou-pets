import { useEffect, useRef, useState } from 'react';

// Firestore returns a whole query's results in one network round trip -
// there's no real per-document loading progress to report (fetching one
// document at a time instead would mean N round trips for the same N
// billed reads, which is strictly worse). This simulates the progress
// feel anyway: the data is already in hand, but it's revealed as a short
// counting animation (1/N up to N/N) so a list of any size gives the same
// reassuring "it's working" feedback a real per-item load would.
const ANIMATION_DURATION_MS = 600;
const MIN_STEP_MS = 15;
const MAX_STEP_MS = 80;

export function useLoadWithProgress(fetchFn, deps = []) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null); // { current, total } while animating, else null
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProgress(null);
    if (timerRef.current) clearInterval(timerRef.current);

    fetchFn().then((result) => {
      if (cancelled) return;
      const total = result.length;
      if (total === 0) {
        setItems(result);
        setLoading(false);
        return;
      }
      const stepMs = Math.max(MIN_STEP_MS, Math.min(MAX_STEP_MS, ANIMATION_DURATION_MS / total));
      let current = 0;
      setProgress({ current, total });
      timerRef.current = setInterval(() => {
        current += 1;
        if (current >= total) {
          clearInterval(timerRef.current);
          if (!cancelled) {
            setItems(result);
            setProgress(null);
            setLoading(false);
          }
          return;
        }
        if (!cancelled) setProgress({ current, total });
      }, stepMs);
    });

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { items, loading, progress };
}
