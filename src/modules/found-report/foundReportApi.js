import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';
import { uploadPhotos } from '../shared/uploadPhotos.js';

/**
 * Creates a found/seen-cat report. Keeps the uploader's identity
 * (reportedByUid) separate from the source fields (who originally posted,
 * which group, roughly when) - the uploader is usually not the original
 * poster, and that distinction is what lets an owner trace back to the
 * source even when no phone number was left.
 */
export async function createFoundReport(fields, photoFiles, reportedByUid) {
  const reportRef = await addDoc(collection(db, COLLECTIONS.FOUND_REPORTS), {
    species: 'cat',
    colorDescription: fields.colorDescription || '',
    markings: fields.markings || '',
    hasCollar: fields.hasCollar ?? null,
    location: fields.location || '',
    dateText: fields.dateText || '',
    condition: fields.condition || 'seen_only',
    contactName: fields.contactName || '',
    contactPhone: fields.contactPhone || '',
    notes: fields.notes || '',
    sourceGroupName: fields.sourceGroupName || '',
    originalPosterName: fields.originalPosterName || '',
    sharedByName: fields.sharedByName || '',
    postAgeText: fields.postAgeText || '',
    photos: [],
    status: 'new',
    source: fields.source || 'manual',
    reportedByUid,
    createdAt: serverTimestamp(),
  });

  if (photoFiles && photoFiles.length > 0) {
    const photos = await uploadPhotos(photoFiles, 'found-reports', reportRef.id);
    await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportRef.id), { photos }, { merge: true });
  }

  return reportRef.id;
}

export async function getFoundReport(reportId) {
  const snap = await getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Updates an existing found report's editable fields. Photos removed by the
 * user are deleted from storage; remaining existing photos plus any newly
 * uploaded ones become the new `photos` array.
 */
export async function updateFoundReport(
  reportId,
  fields,
  { newPhotoFiles = [], removedPhotoPaths = [], existingPhotos = [] } = {}
) {
  await setDoc(
    doc(db, COLLECTIONS.FOUND_REPORTS, reportId),
    {
      colorDescription: fields.colorDescription || '',
      markings: fields.markings || '',
      hasCollar: fields.hasCollar ?? null,
      location: fields.location || '',
      dateText: fields.dateText || '',
      condition: fields.condition || 'seen_only',
      contactName: fields.contactName || '',
      contactPhone: fields.contactPhone || '',
      notes: fields.notes || '',
      sourceGroupName: fields.sourceGroupName || '',
      originalPosterName: fields.originalPosterName || '',
      sharedByName: fields.sharedByName || '',
      postAgeText: fields.postAgeText || '',
    },
    { merge: true }
  );

  if (removedPhotoPaths.length === 0 && newPhotoFiles.length === 0) return;

  if (removedPhotoPaths.length > 0) {
    await Promise.all(removedPhotoPaths.map((path) => deleteObject(ref(storage, path)).catch(() => {})));
  }

  const keptPhotos = existingPhotos.filter((p) => !removedPhotoPaths.includes(p.path));
  const uploaded = newPhotoFiles.length > 0 ? await uploadPhotos(newPhotoFiles, 'found-reports', reportId) : [];

  await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId), { photos: [...keptPhotos, ...uploaded] }, { merge: true });
}
