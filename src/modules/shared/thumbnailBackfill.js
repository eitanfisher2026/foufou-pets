import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

/**
 * One-time (but safe to re-run) migration: generates a small thumbnail for
 * the main photo of every existing lost case/found report that doesn't
 * have one yet. Runs server-side (see backfillPhotoThumbnails in
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

/**
 * One-time (but safe to re-run) cleanup: removes the thumbnail files and
 * Firestore fields for every photo that isn't a record's main photo -
 * undoing an earlier version of the backfill above, which thumbnailed
 * every photo in a report before that was scoped down to just the one a
 * list/search row actually shows.
 */
export async function cleanupExtraPhotoThumbnails() {
  const call = httpsCallable(functions, 'cleanupExtraPhotoThumbnails', { timeout: 300000 });
  const result = await call();
  return result.data;
}
