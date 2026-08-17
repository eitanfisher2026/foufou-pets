import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase.js';
import { compressImage, compressThumbnail } from './imageCompression.js';

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
    await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(storageRef);

    if (index !== thumbnailIndex) return { path, url };

    const thumb = await compressThumbnail(compressed);
    const thumbPath = `${base}_thumb.jpg`;
    const thumbRef = ref(storage, thumbPath);
    await uploadBytes(thumbRef, thumb, { contentType: 'image/jpeg' });
    const thumbUrl = await getDownloadURL(thumbRef);

    return { path, url, thumbPath, thumbUrl };
  });

  return Promise.all(uploads);
}
