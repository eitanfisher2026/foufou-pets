import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from './collections.js';
import { shortSnippet } from './textSnippet.js';

/**
 * Fills in a display name for existing records that were saved without one
 * (the common case for a street cat/dog with no known name) but do have a
 * markings description to derive one from - the same shortSnippet fallback
 * already used to compute a display name on the fly (see
 * displayLostCaseName/displayFoundReportName), just written to the record
 * itself instead of only ever being computed at render time. Safe to run
 * more than once: only touches records whose name/title is still exactly
 * empty, so it never overwrites a real name someone already set (by hand or
 * via the pencil-edit on the record's page) and does nothing on a second
 * run once everything derivable has been filled in.
 */
export async function backfillDisplayNames() {
  const [lostCount, foundCount] = await Promise.all([
    backfillCollection(COLLECTIONS.LOST_CASES, 'name'),
    backfillCollection(COLLECTIONS.FOUND_REPORTS, 'title'),
  ]);
  return { lostCount, foundCount };
}

async function backfillCollection(collectionName, nameField) {
  const snap = await getDocs(query(collection(db, collectionName), where(nameField, '==', '')));
  const updates = snap.docs
    .map((d) => ({ ref: d.ref, snippet: shortSnippet(d.data().markings) }))
    .filter((u) => u.snippet);

  // Firestore batches cap at 500 writes - chunk just in case this ever runs
  // against a much larger dataset than exists today.
  for (let i = 0; i < updates.length; i += 500) {
    const batch = writeBatch(db);
    for (const u of updates.slice(i, i + 500)) {
      batch.update(u.ref, { [nameField]: u.snippet });
    }
    await batch.commit();
  }

  return updates.length;
}
