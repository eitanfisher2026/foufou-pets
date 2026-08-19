import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

/**
 * Asks the backend to judge whether a lost-report photo and a found-report
 * photo could plausibly show the same animal (see comparePhotoSimilarity in
 * functions/index.js) - runs server-side since it needs a paid AI vision
 * call. Returns { verdict, explanation, _aiUsage }. Callers (see
 * maybeCheckPhotoSimilarity in matchingApi.js) are responsible for only
 * calling this for pairs that already cleared the configured confidence
 * threshold - this function itself has no gating logic.
 */
export async function comparePhotoSimilarity(lostPhotoUrl, foundPhotoUrl) {
  const call = httpsCallable(functions, 'comparePhotoSimilarity', { timeout: 60000 });
  const result = await call({ lostPhotoUrl, foundPhotoUrl });
  return result.data;
}
