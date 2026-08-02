import { useState } from 'react';
import { readScreenshots } from '../screenshot-ingestion/readScreenshots.js';

/**
 * Shared loading/error wrapper around readScreenshots(), used by both the
 * lost-report and found-report forms.
 */
export function useScreenshotReader() {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  async function read(files) {
    setReading(true);
    setError('');
    try {
      return await readScreenshots(files);
    } catch (err) {
      setError('לא הצלחנו לקרוא את התמונה. ניתן למלא את הפרטים ידנית.');
      throw err;
    } finally {
      setReading(false);
    }
  }

  return { reading, error, read };
}
