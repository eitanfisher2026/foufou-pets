import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
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
