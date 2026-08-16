import { collection, doc, getDocs, runTransaction, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, SPECIES } from './collections.js';

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

function byCreatedAt(a, b) {
  return (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0);
}

async function assignNumbers(docs, type) {
  if (docs.length === 0) return 0;

  // Reserve the whole range up front (one transaction, not one per record)
  // so a live createLostCase/createFoundReport running at the same time as
  // this migration still can't collide with it.
  let next = await runTransaction(db, async (tx) => {
    const counterRef = doc(db, 'recordCounters', type);
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? snap.data().value || 0 : 0;
    tx.set(counterRef, { value: current + docs.length }, { merge: true });
    return current + 1;
  });

  // Firestore batches cap at 500 writes - chunk just in case this ever runs
  // against a much larger dataset than exists today.
  for (let i = 0; i < docs.length; i += 500) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 500)) {
      batch.update(d.ref, { recordNumber: formatRecordNumber(type, next) });
      next += 1;
    }
    await batch.commit();
  }
  return docs.length;
}

async function backfillCollection(collectionName, catType, dogType) {
  const snap = await getDocs(collection(db, collectionName));
  const byType = { [catType]: [], [dogType]: [] };
  snap.docs.forEach((d) => {
    if (d.data().recordNumber) return;
    const type = d.data().species === SPECIES.DOG ? dogType : catType;
    byType[type].push(d);
  });
  byType[catType].sort(byCreatedAt);
  byType[dogType].sort(byCreatedAt);

  const catCount = await assignNumbers(byType[catType], catType);
  const dogCount = await assignNumbers(byType[dogType], dogType);
  return { catCount, dogCount };
}

/**
 * One-time (but safe to re-run) migration: assigns LC/LD/FC/FD numbers to
 * every existing lost case/found report that doesn't have one yet, oldest
 * first within each type so earlier real-world reports get lower numbers.
 * Only ever touches records missing a recordNumber, so running it again
 * (or running it after the live nextRecordNumber has already numbered some
 * newer records) does nothing to what's already assigned.
 */
export async function backfillRecordNumbers() {
  const [lost, found] = await Promise.all([
    backfillCollection(COLLECTIONS.LOST_CASES, 'lost_cat', 'lost_dog'),
    backfillCollection(COLLECTIONS.FOUND_REPORTS, 'found_cat', 'found_dog'),
  ]);
  return { lc: lost.catCount, ld: lost.dogCount, fc: found.catCount, fd: found.dogCount };
}
