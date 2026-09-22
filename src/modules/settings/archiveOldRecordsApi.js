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
    // Authoritative counts, NOT derived by summing the species buckets
    // above - a record with a missing/unexpected species value (neither
    // exactly SPECIES.CAT nor SPECIES.DOG) falls through both buckets and
    // was silently invisible in the preview total, even though the actual
    // deletion below never filters by species and deletes it anyway. That
    // gap is exactly what made the preview count and the real run's total
    // disagree.
    lostTotal: lostCases.length,
    foundTotal: foundReports.length,
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
 * Runs in fixed-size concurrent batches (BATCH_SIZE at a time), not fully
 * sequential (too slow with any real backlog - see the fix for the
 * scheduled cleanup timing out) and not fully unbounded either (every
 * record's deletion is several Storage/Firestore calls on its own, so a
 * large backlog turned into hundreds of simultaneous browser requests at
 * once, which risked tripping a burst rate limit). A batch boundary also
 * gives shouldStop somewhere real to take effect - already-started deletes
 * in the current batch still finish (an in-flight delete can't be
 * cancelled), but no new batch starts once it returns true.
 *
 * onProgress(done, total) reports records processed, for a progress bar.
 */
const ARCHIVE_BATCH_SIZE = 10;

export async function archiveOldRecords(cutoffDate, onProgress, shouldStop) {
  const { lostCases, foundReports } = await findOldActiveRecords(cutoffDate);
  const queue = [
    ...lostCases.map((d) => ({ kind: 'lost', d })),
    ...foundReports.map((d) => ({ kind: 'found', d })),
  ];
  const total = queue.length;
  let done = 0;
  let lostArchived = 0;
  let foundArchived = 0;
  onProgress?.(done, total);

  for (let i = 0; i < queue.length; i += ARCHIVE_BATCH_SIZE) {
    if (shouldStop?.()) break;
    const batch = queue.slice(i, i + ARCHIVE_BATCH_SIZE);
    await Promise.all(
      batch.map(({ kind, d }) =>
        (kind === 'lost' ? deleteLostCase(d.id, d.data().photos || []) : deleteFoundReport(d.id, d.data().photos || [])).then(() => {
          if (kind === 'lost') lostArchived += 1;
          else foundArchived += 1;
          done += 1;
          onProgress?.(done, total);
        })
      )
    );
  }

  return { lostCasesArchived: lostArchived, foundReportsArchived: foundArchived };
}
