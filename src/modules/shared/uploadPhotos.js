import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase.js';
import { compressImage, compressThumbnail } from './imageCompression.js';

/**
 * Compresses and uploads a batch of photo files under `folder/<reportId>/`,
 * each alongside a small dedicated thumbnail (resized from the already-
 * compressed main image, not the original, since it's cheaper to shrink
 * further than to decode the full-resolution source twice) - list/search
 * rows load thumbUrl instead of the full-size url, so a long list doesn't
 * pull down full-size photos just to show them at 64px.
 * Returns [{ path, url, thumbPath, thumbUrl }] in the same order as the
 * input files.
 */
export async function uploadPhotos(files, folder, reportId) {
  const uploads = files.map(async (file, index) => {
    const compressed = await compressImage(file);
    const thumb = await compressThumbnail(compressed);

    const base = `${folder}/${reportId}/${Date.now()}_${index}`;
    const path = `${base}.jpg`;
    const thumbPath = `${base}_thumb.jpg`;

    const storageRef = ref(storage, path);
    const thumbRef = ref(storage, thumbPath);
    const [url, thumbUrl] = await Promise.all([
      uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' }).then(() => getDownloadURL(storageRef)),
      uploadBytes(thumbRef, thumb, { contentType: 'image/jpeg' }).then(() => getDownloadURL(thumbRef)),
    ]);

    return { path, url, thumbPath, thumbUrl };
  });

  return Promise.all(uploads);
}
