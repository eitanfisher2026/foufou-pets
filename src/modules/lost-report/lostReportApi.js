import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { COLLECTIONS, RECORD_STATUS } from '../shared/collections.js';
import { uploadPhotos } from '../shared/uploadPhotos.js';

/**
 * Creates a lost-cat case: writes the Firestore doc first (to get an id for
 * the photo storage path), then attaches uploaded photo URLs.
 */
export async function createLostCase(fields, photoFiles, ownerId) {
  const caseRef = await addDoc(collection(db, COLLECTIONS.LOST_CASES), {
    species: 'cat',
    name: fields.name || '',
    color: fields.color || '',
    breed: fields.breed || '',
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
    aiCostUsd: fields.aiCostUsd || 0,
    photos: [],
    status: RECORD_STATUS.ACTIVE,
    source: fields.source || 'manual',
    ownerId,
    createdAt: serverTimestamp(),
  });

  if (photoFiles && photoFiles.length > 0) {
    const photos = await uploadPhotos(photoFiles, 'lost-cases', caseRef.id);
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
      breed: fields.breed || '',
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
      returnedToOwner: fields.returnedToOwner || false,
      closingComment: fields.closingComment || '',
      sourceGroupName: fields.sourceGroupName || '',
      originalPosterName: fields.originalPosterName || '',
      sharedByName: fields.sharedByName || '',
      postAgeText: fields.postAgeText || '',
      aiCostUsd: fields.aiCostUsd || 0,
    },
    { merge: true }
  );

  if (newPhotoFiles.length > 0) {
    const uploaded = await uploadPhotos(newPhotoFiles, 'lost-cases', caseId);
    await setDoc(doc(db, COLLECTIONS.LOST_CASES, caseId), { photos: arrayUnion(...uploaded) }, { merge: true });
  }
}

export async function updateLostCaseStatus(caseId, status) {
  await setDoc(doc(db, COLLECTIONS.LOST_CASES, caseId), { status }, { merge: true });
}

/**
 * Deletes one photo immediately: removes it from storage and updates the
 * case's `photos` array to match. Returns the resulting photo list.
 */
export async function removeLostCasePhoto(caseId, photo, currentPhotos) {
  await deleteObject(ref(storage, photo.path)).catch(() => {});
  const remaining = currentPhotos.filter((p) => p.path !== photo.path);
  await setDoc(doc(db, COLLECTIONS.LOST_CASES, caseId), { photos: remaining }, { merge: true });
  return remaining;
}

/**
 * Moves one photo to the front of the case's photo list (the "main photo"
 * slot) immediately - lets the user override an AI-picked main photo that
 * came out wrong. Returns the resulting photo list.
 */
export async function makeLostCasePhotoMain(caseId, photo, currentPhotos) {
  const reordered = [photo, ...currentPhotos.filter((p) => p.path !== photo.path)];
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
  await Promise.all(photos.map((p) => deleteObject(ref(storage, p.path)).catch(() => {})));
  await deleteDoc(doc(db, COLLECTIONS.LOST_CASES, caseId));
}
