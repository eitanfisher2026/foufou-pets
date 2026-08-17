import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

/**
 * Asks the backend to generate a small thumbnail for one already-uploaded
 * photo that doesn't have one yet (see generatePhotoThumbnail in
 * functions/index.js) - used when a secondary photo (never thumbnailed on
 * upload, since only a record's main photo is - see uploadPhotos.js) is
 * promoted to be the main photo, or becomes the main photo because the
 * previous one was deleted. Runs server-side: fetching an existing photo's
 * Storage download URL from the browser hits Storage's CORS policy.
 * Returns { thumbPath, thumbUrl } - callers merge this into their own
 * photos array and write it themselves.
 */
export async function generatePhotoThumbnail(path, url) {
  const call = httpsCallable(functions, 'generatePhotoThumbnail', { timeout: 30000 });
  const result = await call({ path, url });
  return result.data;
}
