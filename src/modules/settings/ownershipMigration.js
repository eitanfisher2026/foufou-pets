import { collection, doc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';
import { ROLES } from '../users/usersApi.js';

const BATCH_SIZE = 400; // Firestore's write-batch limit is 500 - stay comfortably under it.

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function stampCollection(collectionName, ownerField, ownerUid, now) {
  const snap = await getDocs(collection(db, collectionName));
  for (const group of chunk(snap.docs, BATCH_SIZE)) {
    const batch = writeBatch(db);
    for (const docSnap of group) {
      batch.set(docSnap.ref, { [ownerField]: ownerUid, createdAt: now, updatedAt: now }, { merge: true });
    }
    await batch.commit();
  }
  return snap.docs.length;
}

/**
 * One-time backfill for records created before ownership/timestamp
 * tracking existed: sets ownerId/reportedByUid on every lost case and
 * found report to whoever runs this, and createdAt/updatedAt to right
 * now. Also promotes the person running it to admin - the normal sign-in
 * flow always creates a brand-new user as REGULAR (see usersApi.js), so
 * without this there'd be no way for anyone to ever become the first
 * admin.
 */
export async function migrateOwnershipAndTimestamps(currentUser) {
  const now = serverTimestamp();

  const lostCases = await stampCollection(COLLECTIONS.LOST_CASES, 'ownerId', currentUser.uid, now);
  const foundReports = await stampCollection(COLLECTIONS.FOUND_REPORTS, 'reportedByUid', currentUser.uid, now);

  await setDoc(
    doc(db, 'users', currentUser.uid),
    {
      email: currentUser.email || '',
      displayName: currentUser.displayName || '',
      photoURL: currentUser.photoURL || '',
      role: ROLES.ADMIN,
      createdAt: now,
      lastLoginAt: now,
    },
    { merge: true }
  );

  return { lostCases, foundReports };
}
