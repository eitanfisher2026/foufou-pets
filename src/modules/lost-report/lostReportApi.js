import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';
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
    size: fields.size || '',
    markings: fields.markings || '',
    hasCollar: fields.hasCollar || false,
    lastSeenLocation: fields.lastSeenLocation || '',
    lastSeenAt: fields.lastSeenAt || '',
    contactName: fields.contactName || '',
    contactPhone: fields.contactPhone || '',
    notes: fields.notes || '',
    photos: [],
    status: 'open',
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
 * Updates an existing lost case's editable fields. Photos removed by the
 * user are deleted from storage; remaining existing photos plus any newly
 * uploaded ones become the new `photos` array.
 */
export async function updateLostCase(caseId, fields, { newPhotoFiles = [], removedPhotoPaths = [], existingPhotos = [] } = {}) {
  await setDoc(
    doc(db, COLLECTIONS.LOST_CASES, caseId),
    {
      name: fields.name || '',
      color: fields.color || '',
      size: fields.size || '',
      markings: fields.markings || '',
      hasCollar: fields.hasCollar || false,
      lastSeenLocation: fields.lastSeenLocation || '',
      lastSeenAt: fields.lastSeenAt || '',
      contactName: fields.contactName || '',
      contactPhone: fields.contactPhone || '',
      notes: fields.notes || '',
    },
    { merge: true }
  );

  if (removedPhotoPaths.length === 0 && newPhotoFiles.length === 0) return;

  if (removedPhotoPaths.length > 0) {
    await Promise.all(removedPhotoPaths.map((path) => deleteObject(ref(storage, path)).catch(() => {})));
  }

  const keptPhotos = existingPhotos.filter((p) => !removedPhotoPaths.includes(p.path));
  const uploaded = newPhotoFiles.length > 0 ? await uploadPhotos(newPhotoFiles, 'lost-cases', caseId) : [];

  await setDoc(doc(db, COLLECTIONS.LOST_CASES, caseId), { photos: [...keptPhotos, ...uploaded] }, { merge: true });
}
