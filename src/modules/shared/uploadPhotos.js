import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase.js';
import { compressImage, compressThumbnail } from './imageCompression.js';

// storage.rules checks photo-write ownership by reading the just-created
// Firestore record (firestore.get(...).data.ownerId/reportedByUid) - a
// cross-service read that Firebase's own docs note can briefly lag behind a
// write that only just happened, since Storage rules evaluation and
// Firestore's write path are different backends. Uploading a brand-new
// record's own photos immediately after creating it (every create flow
// does exactly this) sits right in that gap, which showed up as a reliably
// reproducible storage/unauthorized on the very first upload. Only retried
// for that specific code - a real ownership rejection (wrong user) would
// keep failing the same way regardless of how long it waits, and this
// still throws after retrying, so that case surfaces exactly as before.
const UNAUTHORIZED_RETRY_DELAYS_MS = [500, 1000, 2000];

async function uploadBytesWithRetry(storageRef, data, metadata) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await uploadBytes(storageRef, data, metadata);
    } catch (err) {
      if (err.code !== 'storage/unauthorized' || attempt >= UNAUTHORIZED_RETRY_DELAYS_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, UNAUTHORIZED_RETRY_DELAYS_MS[attempt]));
    }
  }
}

/**
 * Compresses and uploads a batch of photo files under `folder/<reportId>/`.
 * Only the file at `thumbnailIndex` (if given) also gets a small dedicated
 * thumbnail - that's the only photo a list/search row ever actually shows
 * (`photos[0]`), so there's no point paying to generate and store one for
 * every screenshot in a multi-photo report when just the main one is ever
 * displayed there. Callers pass the index that will become (or already is)
 * the record's main photo; omit it to skip thumbnailing entirely (e.g. when
 * adding more photos to a record that already has a main one).
 * Returns [{ path, url, thumbPath?, thumbUrl? }] in the same order as the
 * input files.
 */
export async function uploadPhotos(files, folder, reportId, { thumbnailIndex = null } = {}) {
  const uploads = files.map(async (file, index) => {
    const compressed = await compressImage(file);
    const base = `${folder}/${reportId}/${Date.now()}_${index}`;
    const path = `${base}.jpg`;

    const storageRef = ref(storage, path);
    await uploadBytesWithRetry(storageRef, compressed, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(storageRef);

    if (index !== thumbnailIndex) return { path, url };

    const thumb = await compressThumbnail(compressed);
    const thumbPath = `${base}_thumb.jpg`;
    const thumbRef = ref(storage, thumbPath);
    await uploadBytesWithRetry(thumbRef, thumb, { contentType: 'image/jpeg' });
    const thumbUrl = await getDownloadURL(thumbRef);

    return { path, url, thumbPath, thumbUrl };
  });

  return Promise.all(uploads);
}
