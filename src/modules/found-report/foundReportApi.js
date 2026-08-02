import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
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
