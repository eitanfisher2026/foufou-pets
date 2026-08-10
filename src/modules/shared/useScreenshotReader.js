import { useRef, useState } from 'react';
import { readScreenshots } from '../screenshot-ingestion/readScreenshots.js';

/**
 * Shared loading/error wrapper around readScreenshots(), used by both the
 * lost-report and found-report forms. Supports cancel(): the Firebase
 * callable SDK has no way to actually abort an in-flight request, so the AI
 * call still runs (and is still billed) to completion in the background -
 * cancel() just stops the UI from waiting on it and discards whatever comes
 * back, so the user can immediately try a different photo instead of being
 * stuck until the original call resolves or times out.
 */
export function useScreenshotReader() {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const cancelledRef = useRef(false);

  async function read(files) {
    setReading(true);
    setError('');
    cancelledRef.current = false;
    try {
      const result = await readScreenshots(files);
      if (cancelledRef.current) throw new Error('cancelled');
      return result;
    } catch (err) {
      if (!cancelledRef.current) setError('לא הצלחנו לקרוא את התמונה. ניתן למלא את הפרטים ידנית.');
      throw err;
    } finally {
      if (!cancelledRef.current) setReading(false);
    }
  }

  function cancel() {
    cancelledRef.current = true;
    setReading(false);
    setError('');
  }

  return { reading, error, read, cancel };
}
