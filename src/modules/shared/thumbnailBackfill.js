import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

/**
 * One-time (but safe to re-run) migration: generates a small list-thumbnail
 * for every existing photo that doesn't have one yet, across both lost
 * cases and found reports. Runs server-side (see backfillPhotoThumbnails in
 * functions/index.js) rather than in the browser - fetching an existing
 * photo's Firebase Storage download URL via the browser's fetch() hits
 * Storage's CORS policy (it only allows same-origin <img> loads, not
 * cross-origin fetch/canvas reads), so this can't be done client-side the
 * way a fresh upload's thumbnail is.
 */
export async function backfillPhotoThumbnails() {
  const call = httpsCallable(functions, 'backfillPhotoThumbnails', { timeout: 300000 });
  const result = await call();
  return result.data;
}
