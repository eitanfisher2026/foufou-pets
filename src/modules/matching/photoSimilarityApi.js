import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

/**
 * Asks the backend to judge whether a lost-report photo and a found-report
 * photo could plausibly show the same animal (see comparePhotoSimilarity in
 * functions/index.js) - runs server-side since it needs a paid AI call
 * either way. Returns { verdict, explanation, providerModel, _aiUsage }.
 * lostCaseId/foundReportId are only actually used when the currently
 * selected photoCompareProviderKind is an embedding provider (Jina/Voyage) -
 * that path caches each photo's embedding on its own record rather than
 * recomputing it per comparison, and needs somewhere to cache it. Callers
 * (see maybeCheckPhotoSimilarity in matchingApi.js) are responsible for only
 * calling this for pairs that already cleared the configured confidence
 * threshold - this function itself has no gating logic.
 */
export async function comparePhotoSimilarity(lostPhotoUrl, foundPhotoUrl, lostCaseId, foundReportId) {
  const call = httpsCallable(functions, 'comparePhotoSimilarity', { timeout: 60000 });
  const result = await call({ lostPhotoUrl, foundPhotoUrl, lostCaseId, foundReportId });
  return result.data;
}
