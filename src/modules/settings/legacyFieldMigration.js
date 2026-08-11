import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';
import { appendLine, appendDetail } from '../shared/textMerge.js';

// One-time migration for the colorDescription/hasFluffyTail/lastSeenLocation
// (lost) and colorDescription/hasFluffyTail/location (found) fields retired
// when the report forms were reorganized into sections - folds whatever's
// in them into markings/neighborhood on each existing record, then clears
// the old fields. Safe to run more than once: appendLine/appendDetail skip
// text that's already present, so a record already migrated is a no-op.
async function migrateCollection(collectionName, locationField) {
  const snap = await getDocs(collection(db, collectionName));
  let updated = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const hasLegacyData = data.colorDescription || data.hasFluffyTail || data[locationField];
    if (!hasLegacyData) continue;

    let markings = data.markings || '';
    markings = appendLine(markings, data.colorDescription);
    if (data.hasFluffyTail === true) markings = appendLine(markings, 'זנב שעיר/פלומתי במיוחד');

    const neighborhood = appendDetail(data.neighborhood || '', data[locationField]);

    await updateDoc(doc(db, collectionName, docSnap.id), {
      markings,
      neighborhood,
      colorDescription: '',
      hasFluffyTail: null,
      [locationField]: '',
    });
    updated++;
  }

  return updated;
}

/** Returns { lostCases, foundReports } counts of records that were updated. */
export async function migrateLegacyFields() {
  const lostCases = await migrateCollection(COLLECTIONS.LOST_CASES, 'lastSeenLocation');
  const foundReports = await migrateCollection(COLLECTIONS.FOUND_REPORTS, 'location');
  return { lostCases, foundReports };
}
