import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase.js';
import { compressImage } from './imageCompression.js';

/**
 * Compresses and uploads a batch of photo files under `folder/<reportId>/`.
 * Returns [{ path, url }] in the same order as the input files.
 */
export async function uploadPhotos(files, folder, reportId) {
  const uploads = files.map(async (file, index) => {
    const compressed = await compressImage(file);
    const path = `${folder}/${reportId}/${Date.now()}_${index}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(storageRef);
    return { path, url };
  });

  return Promise.all(uploads);
}
