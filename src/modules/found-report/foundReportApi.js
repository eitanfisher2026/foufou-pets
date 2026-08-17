import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { COLLECTIONS, RECORD_STATUS, SPECIES, DEFAULT_DOG_BREED } from '../shared/collections.js';
import { uploadPhotos } from '../shared/uploadPhotos.js';
import { nextRecordNumber } from '../shared/recordNumberApi.js';
import { generatePhotoThumbnail } from '../shared/photoThumbnailApi.js';

// A dog record saved with a truly blank breed (not even the "מעורב (לא
// ידוע)" default) can't be usefully compared on breed at all - the
// matching engine treats "unspecified" as "skip", so a real breed on the
// other side just silently never gets checked against it. This is the
// last-resort backstop (the direct forms and the smart-intake flow all
// nudge for a real breed before this ever matters), catching any path -
// present or future - that might still let one through. Cats don't need
// this: the forms already default a blank cat breed to the street-cat
// default up front, and it's a much softer requirement for them anyway.
function normalizeBreed(breed, species) {
  return breed || (species === SPECIES.DOG ? DEFAULT_DOG_BREED : '');
}

/**
 * Creates a found/seen-cat report. Keeps the uploader's identity
 * (reportedByUid) separate from the source fields (who originally posted,
 * which group, roughly when) - the uploader is usually not the original
 * poster, and that distinction is what lets an owner trace back to the
 * source even when no phone number was left. reporterName/reporterEmail
 * are denormalized from the uploader at this moment (not looked up live
 * later) so "who reported this" is visible to everyone without needing
 * read access to another person's user profile doc.
 */
export async function createFoundReport(fields, photoFiles, reporter) {
  const species = fields.species || SPECIES.CAT;
  const recordNumber = await nextRecordNumber('found', species);
  const reportRef = await addDoc(collection(db, COLLECTIONS.FOUND_REPORTS), {
    recordNumber,
    species,
    title: fields.title || '',
    color: fields.color || '',
    pattern: fields.pattern || '',
    breed: normalizeBreed(fields.breed, species),
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
    weightKg: fields.weightKg || '',
    microchipNumber: fields.microchipNumber || '',
    aiCostUsd: fields.aiCostUsd || 0,
    photos: [],
    status: RECORD_STATUS.ACTIVE,
    source: fields.source || 'manual',
    reportedByUid: reporter.uid,
    reporterName: reporter.displayName || '',
    reporterEmail: reporter.email || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (photoFiles && photoFiles.length > 0) {
    const photos = await uploadPhotos(photoFiles, 'found-reports', reportRef.id, { thumbnailIndex: 0 });
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
      pattern: fields.pattern || '',
      breed: normalizeBreed(fields.breed, fields.species),
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
      weightKg: fields.weightKg || '',
      microchipNumber: fields.microchipNumber || '',
      aiCostUsd: fields.aiCostUsd || 0,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (newPhotoFiles.length > 0) {
    const existingSnap = await getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId));
    const hasNoPhotosYet = !(existingSnap.data()?.photos?.length > 0);
    const uploaded = await uploadPhotos(newPhotoFiles, 'found-reports', reportId, { thumbnailIndex: hasNoPhotosYet ? 0 : null });
    await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId), { photos: arrayUnion(...uploaded) }, { merge: true });
  }
}

export async function updateFoundReportStatus(reportId, status) {
  await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId), { status, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Deletes one photo immediately: removes it from storage and updates the
 * report's `photos` array to match. Returns the resulting photo list.
 */
export async function removeFoundReportPhoto(reportId, photo, currentPhotos) {
  await deleteObject(ref(storage, photo.path)).catch(() => {});
  if (photo.thumbPath) await deleteObject(ref(storage, photo.thumbPath)).catch(() => {});
  let remaining = currentPhotos.filter((p) => p.path !== photo.path);
  // Deleting the current main photo promotes the next one to that slot -
  // if it's a secondary photo that was never thumbnailed (see
  // thumbnailIndex in uploadPhotos.js), it needs one now that it's the
  // photo the list actually shows.
  if (remaining[0] && !remaining[0].thumbUrl) {
    const thumb = await generatePhotoThumbnail(remaining[0].path, remaining[0].url);
    remaining = [{ ...remaining[0], ...thumb }, ...remaining.slice(1)];
  }
  await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId), { photos: remaining }, { merge: true });
  return remaining;
}

/**
 * Moves one photo to the front of the report's photo list (the "main
 * photo" slot) immediately - lets the user override an AI-picked main
 * photo that came out wrong. Returns the resulting photo list.
 */
export async function makeFoundReportPhotoMain(reportId, photo, currentPhotos) {
  // A secondary photo being promoted to main was never thumbnailed on
  // upload (see thumbnailIndex in uploadPhotos.js) - generate one now that
  // it's about to become the photo the list actually shows.
  const mainPhoto = photo.thumbUrl ? photo : { ...photo, ...(await generatePhotoThumbnail(photo.path, photo.url)) };
  const reordered = [mainPhoto, ...currentPhotos.filter((p) => p.path !== photo.path)];
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
  await Promise.all(
    photos.flatMap((p) => [
      deleteObject(ref(storage, p.path)).catch(() => {}),
      p.thumbPath ? deleteObject(ref(storage, p.thumbPath)).catch(() => {}) : null,
    ].filter(Boolean))
  );
  await deleteDoc(doc(db, COLLECTIONS.FOUND_REPORTS, reportId));
}
