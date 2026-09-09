import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { compressImage, compressThumbnail } from './imageCompression.js';
import { blobToBase64 } from './blobToBase64.js';

const uploadReportPhoto = httpsCallable(functions, 'uploadReportPhoto');

// storage.rules' own ownership check (firestore.get() on the record this
// photo belongs to) turned out to race a record's own creation write far
// more than a short retry could reliably outrun in practice (see
// uploadReportPhoto in functions/index.js for the real fix) - every fresh
// record's very first photo upload happens the instant after that record's
// Firestore doc is created, which is exactly the case where a Storage
// rule's cross-service read is least likely to have caught up yet. Routing
// the actual write through a Cloud Function sidesteps this entirely: the
// function checks ownership with a direct Admin SDK read (no cross-service
// rule lag to race) before writing with elevated privileges. Compression
// stays client-side (free, and unrelated to the permissions problem).
const folderToRecordType = { 'lost-cases': 'lost', 'found-reports': 'found' };

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
  const recordType = folderToRecordType[folder];
  const uploads = files.map(async (file, index) => {
    const compressed = await compressImage(file);
    const base = `${folder}/${reportId}/${Date.now()}_${index}`;
    const path = `${base}.jpg`;
    const base64 = await blobToBase64(compressed);

    let thumbPath;
    let thumbBase64;
    if (index === thumbnailIndex) {
      thumbPath = `${base}_thumb.jpg`;
      thumbBase64 = await blobToBase64(await compressThumbnail(compressed));
    }

    const { data } = await uploadReportPhoto({ recordType, recordId: reportId, path, base64, thumbPath, thumbBase64 });
    return data;
  });

  return Promise.all(uploads);
}
