import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { SPECIES } from './collections.js';

// One shared counter per record type, stored at recordCounters/{type} (see
// firestore.rules) - LC/LD for lost cats/dogs, FC/FD for found cats/dogs.
// Kept as a plain incrementing integer, formatted with the prefix only at
// display/write time, so the counter doc itself stays a trivial {value: N}.
const PREFIX = {
  lost_cat: 'LC',
  lost_dog: 'LD',
  found_cat: 'FC',
  found_dog: 'FD',
};

function typeKey(kind, species) {
  return `${kind}_${species === SPECIES.DOG ? 'dog' : 'cat'}`;
}

function formatRecordNumber(type, n) {
  return `${PREFIX[type]}${String(n).padStart(3, '0')}`;
}

/**
 * Reserves and returns the next record number for one new lost case
 * ('lost') or found report ('found') of the given species - e.g. "LC007".
 * The Firestore transaction is what makes this safe under concurrent
 * creates (two people submitting a lost-cat report at the same moment
 * still get two different numbers, never a duplicate).
 */
export async function nextRecordNumber(kind, species) {
  const type = typeKey(kind, species);
  const counterRef = doc(db, 'recordCounters', type);
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? snap.data().value || 0 : 0;
    const value = current + 1;
    tx.set(counterRef, { value }, { merge: true });
    return value;
  });
  return formatRecordNumber(type, next);
}
