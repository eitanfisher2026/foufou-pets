import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
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
 * Creates a lost-cat case: writes the Firestore doc first (to get an id for
 * the photo storage path), then attaches uploaded photo URLs. ownerName/
 * ownerEmail are denormalized from the creator at this moment (not looked
 * up live later) so "who created this" is visible to everyone without
 * needing read access to another person's user profile doc.
 */
export async function createLostCase(fields, photoFiles, owner) {
  const species = fields.species || SPECIES.CAT;
  const recordNumber = await nextRecordNumber('lost', species);
  const caseRef = await addDoc(collection(db, COLLECTIONS.LOST_CASES), {
    recordNumber,
    species,
    name: fields.name || '',
    color: fields.color || '',
    pattern: fields.pattern || '',
    breed: normalizeBreed(fields.breed, species),
    size: fields.size || '',
    ageClass: fields.ageClass || '',
    furType: fields.furType || '',
    markings: fields.markings || '',
    hasCollar: fields.hasCollar || false,
    collarColor: fields.collarColor || '',
    collarHasBell: fields.collarHasBell ?? null,
    hasClippedEar: fields.hasClippedEar ?? null,
    city: fields.city || '',
    neighborhood: fields.neighborhood || '',
    lastSeenAt: fields.lastSeenAt || '',
    lastSeenDate: fields.lastSeenDate || '',
    lastSeenDateApprox: fields.lastSeenDateApprox || false,
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
    ownerId: owner.uid,
    ownerName: owner.displayName || '',
    ownerEmail: owner.email || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (photoFiles && photoFiles.length > 0) {
    const photos = await uploadPhotos(photoFiles, 'lost-cases', caseRef.id, { thumbnailIndex: 0 });
    await setDoc(doc(db, COLLECTIONS.LOST_CASES, caseRef.id), { photos }, { merge: true });
  }

  return caseRef.id;
}

export async function getLostCase(caseId) {
  const snap = await getDoc(doc(db, COLLECTIONS.LOST_CASES, caseId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Updates an existing lost case's editable fields and appends any newly
 * uploaded photos to the existing ones.
 */
export async function updateLostCase(caseId, fields, newPhotoFiles = []) {
  await setDoc(
    doc(db, COLLECTIONS.LOST_CASES, caseId),
    {
      name: fields.name || '',
      color: fields.color || '',
      pattern: fields.pattern || '',
      breed: normalizeBreed(fields.breed, fields.species),
      size: fields.size || '',
      ageClass: fields.ageClass || '',
      furType: fields.furType || '',
      markings: fields.markings || '',
      hasCollar: fields.hasCollar || false,
      collarColor: fields.collarColor || '',
      collarHasBell: fields.collarHasBell ?? null,
      hasClippedEar: fields.hasClippedEar ?? null,
      city: fields.city || '',
      neighborhood: fields.neighborhood || '',
      lastSeenAt: fields.lastSeenAt || '',
      lastSeenDate: fields.lastSeenDate || '',
      lastSeenDateApprox: fields.lastSeenDateApprox || false,
      contactName: fields.contactName || '',
      contactPhone: fields.contactPhone || '',
      notes: fields.notes || '',
      closureDate: fields.closureDate || '',
      closedBy: fields.closedBy || '',
      closureReason: fields.closureReason || '',
      closingComment: fields.closingComment || '',
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
    const existingSnap = await getDoc(doc(db, COLLECTIONS.LOST_CASES, caseId));
    const hasNoPhotosYet = !(existingSnap.data()?.photos?.length > 0);
    const uploaded = await uploadPhotos(newPhotoFiles, 'lost-cases', caseId, { thumbnailIndex: hasNoPhotosYet ? 0 : null });
    await setDoc(doc(db, COLLECTIONS.LOST_CASES, caseId), { photos: arrayUnion(...uploaded) }, { merge: true });
  }
}

/**
 * Rare escape hatch for a genuinely wrong species (the AI or the person
 * filling in the form mistook a dog for a cat, or vice versa) - not exposed
 * as a normal editable field, since almost every record's species is
 * correct and a visible dropdown here would just invite accidental changes
 * to the one field nothing else can recover from cleanly. Resets every
 * species-scoped field (breed/color/pattern/furType all draw from
 * different option lists per species - a value carried over from the old
 * species could easily not even exist in the new one's list) - the caller
 * is still responsible for clearing this record's matches (see
 * clearMatches/clearMatchesForFoundReport in matchingApi.js), since those
 * were computed against entirely the wrong species' pool and are
 * meaningless once this changes.
 */
export async function fixLostCaseSpecies(caseId, species) {
  await setDoc(
    doc(db, COLLECTIONS.LOST_CASES, caseId),
    { species, breed: '', color: '', pattern: '', furType: '', updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function updateLostCaseStatus(caseId, status) {
  await setDoc(doc(db, COLLECTIONS.LOST_CASES, caseId), { status, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Sets status together with the closure record (date/reason/comment) in one
 * write - used when a case is marked archived or resolved, so a closed case
 * is never left without the details that explain why on the archive page.
 */
export async function updateLostCaseClosure(caseId, status, closure) {
  await setDoc(
    doc(db, COLLECTIONS.LOST_CASES, caseId),
    {
      status,
      closureDate: closure.closureDate || '',
      closureReason: closure.closureReason || '',
      closedBy: closure.closedBy || '',
      closingComment: closure.closingComment || '',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Deletes one photo immediately: removes it from storage and updates the
 * case's `photos` array to match. Returns the resulting photo list.
 */
export async function removeLostCasePhoto(caseId, photo, currentPhotos) {
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
  await setDoc(doc(db, COLLECTIONS.LOST_CASES, caseId), { photos: remaining }, { merge: true });
  return remaining;
}

/**
 * Moves one photo to the front of the case's photo list (the "main photo"
 * slot) immediately - lets the user override an AI-picked main photo that
 * came out wrong. Returns the resulting photo list.
 */
export async function makeLostCasePhotoMain(caseId, photo, currentPhotos) {
  // A secondary photo being promoted to main was never thumbnailed on
  // upload (see thumbnailIndex in uploadPhotos.js) - generate one now that
  // it's about to become the photo the list actually shows.
  const mainPhoto = photo.thumbUrl ? photo : { ...photo, ...(await generatePhotoThumbnail(photo.path, photo.url)) };
  const reordered = [mainPhoto, ...currentPhotos.filter((p) => p.path !== photo.path)];
  await setDoc(doc(db, COLLECTIONS.LOST_CASES, caseId), { photos: reordered }, { merge: true });
  return reordered;
}

/**
 * Permanently deletes a lost case: its photos from storage, its `matches`
 * subcollection, and the case document itself.
 */
export async function deleteLostCase(caseId, photos = []) {
  const matchesSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, caseId, 'matches'));
  await Promise.all(matchesSnap.docs.map((d) => deleteDoc(d.ref)));
  await Promise.all(
    photos.flatMap((p) => [
      deleteObject(ref(storage, p.path)).catch(() => {}),
      p.thumbPath ? deleteObject(ref(storage, p.thumbPath)).catch(() => {}) : null,
    ].filter(Boolean))
  );
  await deleteDoc(doc(db, COLLECTIONS.LOST_CASES, caseId));
}
