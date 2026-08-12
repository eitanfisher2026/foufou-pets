import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { COLLECTIONS, RECORD_STATUS } from '../shared/collections.js';
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
    title: fields.title || '',
    color: fields.color || '',
    breed: fields.breed || '',
    size: fields.size || '',
    ageClass: fields.ageClass || '',
    furType: fields.furType || '',
    markings: fields.markings || '',
    hasCollar: fields.hasCollar ?? null,
    collarColor: fields.collarColor || '',
    collarHasBell: fields.collarHasBell ?? null,
    hasClippedEar: fields.hasClippedEar ?? null,
    city: fields.city || '',
    neighborhood: fields.neighborhood || '',
    dateText: fields.dateText || '',
    seenDate: fields.seenDate || '',
    seenDateApprox: fields.seenDateApprox || false,
    condition: fields.condition || 'seen_only',
    contactName: fields.contactName || '',
    contactPhone: fields.contactPhone || '',
    notes: fields.notes || '',
    sourceGroupName: fields.sourceGroupName || '',
    originalPosterName: fields.originalPosterName || '',
    sharedByName: fields.sharedByName || '',
    postAgeText: fields.postAgeText || '',
    sourceUrl: fields.sourceUrl || '',
    aiCostUsd: fields.aiCostUsd || 0,
    photos: [],
    status: RECORD_STATUS.ACTIVE,
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
 * Updates an existing found report's editable fields and appends any newly
 * uploaded photos to the existing ones.
 */
export async function updateFoundReport(reportId, fields, newPhotoFiles = []) {
  await setDoc(
    doc(db, COLLECTIONS.FOUND_REPORTS, reportId),
    {
      title: fields.title || '',
      color: fields.color || '',
      breed: fields.breed || '',
      size: fields.size || '',
      ageClass: fields.ageClass || '',
      furType: fields.furType || '',
      markings: fields.markings || '',
      hasCollar: fields.hasCollar ?? null,
      collarColor: fields.collarColor || '',
      collarHasBell: fields.collarHasBell ?? null,
      hasClippedEar: fields.hasClippedEar ?? null,
      city: fields.city || '',
      neighborhood: fields.neighborhood || '',
      dateText: fields.dateText || '',
      seenDate: fields.seenDate || '',
      seenDateApprox: fields.seenDateApprox || false,
      condition: fields.condition || 'seen_only',
      contactName: fields.contactName || '',
      contactPhone: fields.contactPhone || '',
      notes: fields.notes || '',
      sourceGroupName: fields.sourceGroupName || '',
      originalPosterName: fields.originalPosterName || '',
      sharedByName: fields.sharedByName || '',
      postAgeText: fields.postAgeText || '',
      sourceUrl: fields.sourceUrl || '',
      aiCostUsd: fields.aiCostUsd || 0,
    },
    { merge: true }
  );

  if (newPhotoFiles.length > 0) {
    const uploaded = await uploadPhotos(newPhotoFiles, 'found-reports', reportId);
    await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId), { photos: arrayUnion(...uploaded) }, { merge: true });
  }
}

export async function updateFoundReportStatus(reportId, status) {
  await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId), { status }, { merge: true });
}

/**
 * Deletes one photo immediately: removes it from storage and updates the
 * report's `photos` array to match. Returns the resulting photo list.
 */
export async function removeFoundReportPhoto(reportId, photo, currentPhotos) {
  await deleteObject(ref(storage, photo.path)).catch(() => {});
  const remaining = currentPhotos.filter((p) => p.path !== photo.path);
  await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId), { photos: remaining }, { merge: true });
  return remaining;
}

/**
 * Moves one photo to the front of the report's photo list (the "main
 * photo" slot) immediately - lets the user override an AI-picked main
 * photo that came out wrong. Returns the resulting photo list.
 */
export async function makeFoundReportPhotoMain(reportId, photo, currentPhotos) {
  const reordered = [photo, ...currentPhotos.filter((p) => p.path !== photo.path)];
  await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId), { photos: reordered }, { merge: true });
  return reordered;
}

/**
 * Permanently deletes a found report: its photos from storage and the
 * report document itself. Any existing matches pointing at it are left as
 * broken references - lost-case detail pages already skip rendering a
 * match whose found report no longer exists.
 */
export async function deleteFoundReport(reportId, photos = []) {
  await Promise.all(photos.map((p) => deleteObject(ref(storage, p.path)).catch(() => {})));
  await deleteDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId));
}
