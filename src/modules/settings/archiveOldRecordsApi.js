import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, RECORD_STATUS, SPECIES } from '../shared/collections.js';
import { deleteLostCase } from '../lost-report/lostReportApi.js';
import { deleteFoundReport } from '../found-report/foundReportApi.js';

function toDate(createdAt) {
  if (!createdAt) return null;
  return createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
}

function isActive(status) {
  return (status || RECORD_STATUS.ACTIVE) === RECORD_STATUS.ACTIVE;
}

// Shared by both functions below so the preview step and the actual run
// always agree on exactly which records qualify - "in the system more than
// X days" means created before the cutoff, still ACTIVE (an already
// archived/resolved/suspended record has nothing to age out of - and
// nothing left to permanently delete either, since it already went through
// a real, determined outcome someone should still be able to look back on).
async function findOldActiveRecords(cutoffDate) {
  const [lostSnap, foundSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.LOST_CASES)),
    getDocs(collection(db, COLLECTIONS.FOUND_REPORTS)),
  ]);
  const qualifies = (data) => {
    if (!isActive(data.status)) return false;
    const created = toDate(data.createdAt);
    return created !== null && created < cutoffDate;
  };
  return {
    lostCases: lostSnap.docs.filter((d) => qualifies(d.data())),
    foundReports: foundSnap.docs.filter((d) => qualifies(d.data())),
  };
}

/**
 * Preview step for archiveOldRecords below - counts what a run would touch,
 * broken down by species, without changing anything. Meant to be shown to
 * an admin before they confirm the actual (permanent, irreversible) deletion.
 */
export async function countOldActiveRecords(cutoffDate) {
  const { lostCases, foundReports } = await findOldActiveRecords(cutoffDate);
  const bySpecies = (docs, species) => docs.filter((d) => d.data().species === species).length;
  return {
    lostCats: bySpecies(lostCases, SPECIES.CAT),
    lostDogs: bySpecies(lostCases, SPECIES.DOG),
    foundCats: bySpecies(foundReports, SPECIES.CAT),
    foundDogs: bySpecies(foundReports, SPECIES.DOG),
  };
}

/**
 * Admin bulk action: PERMANENTLY DELETES every active lost case and found
 * report created before cutoffDate - not a soft archive. Used to used to
 * move these into the archive (RECORD_STATUS.ARCHIVED, still browsable on
 * ArchivePage.jsx) instead of deleting; changed because a record that timed
 * out having never been resolved either way isn't worth keeping around
 * forever, unlike a record that reached a real, determined outcome (found,
 * returned, died - see ArchivePage.jsx, which still only ever shows those).
 * The permanent lifetimeStats counters (see lifetimeStatsApi.js) are what
 * preserve the audit trail across this - they were already incremented at
 * creation time and aren't touched by deletion, so "how many were ever
 * reported" survives this even though the records themselves don't.
 *
 * Reuses deleteLostCase/deleteFoundReport (the same functions the
 * individual "מחיקת התיק"/"מחיקת הדיווח" buttons use) so the cleanup itself
 * - matches subcollection, Storage photos, the record doc - is identical to
 * a manual delete, just run in bulk.
 *
 * onProgress(done, total) reports records processed, for a progress bar.
 */
export async function archiveOldRecords(cutoffDate, onProgress) {
  const { lostCases, foundReports } = await findOldActiveRecords(cutoffDate);
  const total = lostCases.length + foundReports.length;
  let done = 0;
  onProgress?.(done, total);

  for (const d of lostCases) {
    await deleteLostCase(d.id, d.data().photos || []);
    done += 1;
    onProgress?.(done, total);
  }
  for (const d of foundReports) {
    await deleteFoundReport(d.id, d.data().photos || []);
    done += 1;
    onProgress?.(done, total);
  }

  return { lostCasesArchived: lostCases.length, foundReportsArchived: foundReports.length };
}
