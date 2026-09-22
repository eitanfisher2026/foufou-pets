import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, RECORD_STATUS, SPECIES } from '../shared/collections.js';
import { deleteLostCase } from '../lost-report/lostReportApi.js';
import { deleteFoundReport } from '../found-report/foundReportApi.js';
import { incrementMatchedToOwnerCounter } from '../shared/lifetimeStatsApi.js';

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
 * report created before cutoffDate - a record that timed out having never
 * been resolved either way isn't worth keeping around forever, unlike one
 * that actually reached a real reunion (RECORD_STATUS.RESOLVED), which is
 * left alone here entirely (findOldActiveRecords only ever looks at ACTIVE
 * records). The permanent lifetimeStats counters (see lifetimeStatsApi.js)
 * are what preserve the audit trail across this - deleteLostCase/
 * deleteFoundReport record the lostUnresolved/foundUnresolved counters right
 * as they delete, so "how many were ever reported, and how many of those
 * never resolved" survives this even though the records themselves don't.
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
        (kind === 'lost' ? deleteLostCase(d.id, d.data()) : deleteFoundReport(d.id, d.data())).then(() => {
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

// The old string value directly - RECORD_STATUS.ARCHIVED was removed from
// the app's own code (see collections.js) along with the whole archive
// feature, but any record that reached that status before the removal is
// still sitting in Firestore with the literal string "archived" as its
// status. Nothing in the app's normal cleanup paths ever looks at this
// status any more (they only ever touch ACTIVE, once aged out, or RESOLVED,
// never touched at all), so these are permanently stuck otherwise - this is
// a one-time sweep to finish moving them into the new model, not an
// ongoing feature. Whichever of the old closure reasons genuinely meant "a
// real match closed this" (see the removed CLOSURE_REASON.RETURNED_TO_OWNER/
// SYSTEM_MATCH_CLOSED) still counts toward matchedToOwner here, exactly as
// it would have under the old code; everything else (died, gave up, aged
// out, or no reason recorded at all) counts as unresolved, same as any
// other record that never reached a real reunion.
const LEGACY_ARCHIVED_STATUS = 'archived';
const LEGACY_MATCHED_REASONS = new Set(['returned_to_owner', 'system_match_closed']);
const LEGACY_BATCH_SIZE = 10;

/**
 * One-time admin action: finds every lost case/found report still sitting
 * with the old "archived" status (from before the archive feature was
 * removed - see collections.js) and deletes them the same correct way
 * archiveOldRecords above does (photos, matches subcollection, the record
 * doc, and the right permanent lifetimeStats counter), classifying each by
 * its old closureReason first. Safe to run more than once - a second run
 * simply finds nothing left to do, since nothing else can ever set this
 * status again.
 */
export async function countLegacyArchivedRecords() {
  const [lostSnap, foundSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.LOST_CASES), where('status', '==', LEGACY_ARCHIVED_STATUS))),
    getDocs(query(collection(db, COLLECTIONS.FOUND_REPORTS), where('status', '==', LEGACY_ARCHIVED_STATUS))),
  ]);
  return { lostTotal: lostSnap.docs.length, foundTotal: foundSnap.docs.length };
}

export async function cleanupLegacyArchivedRecords(onProgress) {
  const [lostSnap, foundSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.LOST_CASES), where('status', '==', LEGACY_ARCHIVED_STATUS))),
    getDocs(query(collection(db, COLLECTIONS.FOUND_REPORTS), where('status', '==', LEGACY_ARCHIVED_STATUS))),
  ]);
  const queue = [
    ...lostSnap.docs.map((d) => ({ kind: 'lost', d })),
    ...foundSnap.docs.map((d) => ({ kind: 'found', d })),
  ];
  const total = queue.length;
  let done = 0;
  onProgress?.(done, total);

  for (let i = 0; i < queue.length; i += LEGACY_BATCH_SIZE) {
    const batch = queue.slice(i, i + LEGACY_BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ kind, d }) => {
        const data = d.data();
        const wasMatched = LEGACY_MATCHED_REASONS.has(data.closureReason);
        // Passing a locally-overridden status (never written back to
        // Firestore, just what deleteLostCase/deleteFoundReport see) is
        // what keeps their own automatic "wasn't resolved" counter from
        // firing for a record this sweep has already classified as a real
        // match - incrementMatchedToOwnerCounter below covers that case
        // instead, exactly once either way.
        const record = wasMatched ? { ...data, status: RECORD_STATUS.RESOLVED } : data;
        if (kind === 'lost') await deleteLostCase(d.id, record);
        else await deleteFoundReport(d.id, record);
        if (wasMatched) incrementMatchedToOwnerCounter(data.species);
        done += 1;
        onProgress?.(done, total);
      })
    );
  }

  return { lostCasesRemoved: lostSnap.docs.length, foundReportsRemoved: foundSnap.docs.length };
}
