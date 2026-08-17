import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { COLLECTIONS } from './collections.js';
import { compressThumbnail } from './imageCompression.js';

// Mirrors the "<base>.jpg" / "<base>_thumb.jpg" naming uploadPhotos.js gives
// a fresh upload, derived from the existing full-size path instead of
// building a new one, so a photo's thumbnail always lives next to it.
function deriveThumbPath(path) {
  return path.replace(/\.jpg$/i, '_thumb.jpg');
}

async function backfillPhoto(photo) {
  const response = await fetch(photo.url);
  const blob = await response.blob();
  const thumbBlob = await compressThumbnail(blob);
  const thumbPath = deriveThumbPath(photo.path);
  const thumbRef = ref(storage, thumbPath);
  await uploadBytes(thumbRef, thumbBlob, { contentType: 'image/jpeg' });
  const thumbUrl = await getDownloadURL(thumbRef);
  return { ...photo, thumbPath, thumbUrl };
}

async function backfillDoc(docSnap, collectionName) {
  const photos = docSnap.data().photos || [];
  if (photos.length === 0 || photos.every((p) => p.thumbUrl)) {
    return { recordUpdated: false, thumbsCreated: 0, errors: 0 };
  }

  let thumbsCreated = 0;
  let errors = 0;
  let changed = false;

  const updatedPhotos = await Promise.all(
    photos.map(async (photo) => {
      if (photo.thumbUrl) return photo;
      try {
        const result = await backfillPhoto(photo);
        thumbsCreated += 1;
        changed = true;
        return result;
      } catch {
        errors += 1;
        return photo;
      }
    })
  );

  if (changed) {
    await setDoc(doc(db, collectionName, docSnap.id), { photos: updatedPhotos }, { merge: true });
  }

  return { recordUpdated: changed, thumbsCreated, errors };
}

async function backfillCollection(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  const results = await Promise.all(snap.docs.map((d) => backfillDoc(d, collectionName)));
  return results.reduce(
    (acc, r) => ({
      recordsUpdated: acc.recordsUpdated + (r.recordUpdated ? 1 : 0),
      thumbsCreated: acc.thumbsCreated + r.thumbsCreated,
      errors: acc.errors + r.errors,
    }),
    { recordsUpdated: 0, thumbsCreated: 0, errors: 0 }
  );
}

/**
 * One-time (but safe to re-run) migration: generates a small list-thumbnail
 * for every existing photo that doesn't have one yet, across both lost
 * cases and found reports. Only ever touches photos missing thumbUrl, so
 * re-running it after some records already have thumbnails (created
 * directly on upload, going forward) does nothing to those.
 */
export async function backfillPhotoThumbnails() {
  const [lost, found] = await Promise.all([
    backfillCollection(COLLECTIONS.LOST_CASES),
    backfillCollection(COLLECTIONS.FOUND_REPORTS),
  ]);
  return {
    recordsUpdated: lost.recordsUpdated + found.recordsUpdated,
    thumbsCreated: lost.thumbsCreated + found.thumbsCreated,
    errors: lost.errors + found.errors,
  };
}
