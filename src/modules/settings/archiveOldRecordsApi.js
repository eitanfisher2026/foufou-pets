import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, RECORD_STATUS, SPECIES, CLOSURE_REASON } from '../shared/collections.js';
import { updateLostCaseClosure } from '../lost-report/lostReportApi.js';
import { archiveFoundReport } from '../found-report/foundReportApi.js';

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
// archived/resolved/suspended record has nothing to age out of).
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
 * an admin before they confirm the actual archiving.
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
 * Admin bulk action: moves every active lost case and found report created
 * before cutoffDate into the archive, recording who/why via the same
 * closure fields a manual archive already uses (see updateLostCaseClosure/
 * archiveFoundReport) - so an automatically-archived record reads the same
 * way as a manually closed one, just tagged with its own distinct reason
 * (CLOSURE_REASON.SYSTEM_ARCHIVED_OLD) so it stays clear this wasn't a real
 * determined outcome, just aging out.
 *
 * Nothing further is needed to keep archived records out of future
 * matching - checkMatchesForLostCase/checkMatchesForFoundReport (see
 * matchingApi.js) only ever pull candidates whose status is ACTIVE, so an
 * archived record simply stops being offered as a match candidate the
 * moment its status changes here. Existing match history on an archived
 * record is left untouched (still viewable, just frozen) rather than
 * cleared - there's no need to erase it, only to stop adding to it.
 *
 * onProgress(done, total) reports records processed, for a progress bar.
 */
export async function archiveOldRecords(cutoffDate, closedBy, onProgress) {
  const { lostCases, foundReports } = await findOldActiveRecords(cutoffDate);
  const total = lostCases.length + foundReports.length;
  let done = 0;
  onProgress?.(done, total);

  const closure = {
    closureDate: new Date().toISOString().slice(0, 10),
    closureReason: CLOSURE_REASON.SYSTEM_ARCHIVED_OLD,
    closedBy,
    closingComment: '',
  };

  for (const d of lostCases) {
    await updateLostCaseClosure(d.id, RECORD_STATUS.ARCHIVED, closure);
    done += 1;
    onProgress?.(done, total);
  }
  for (const d of foundReports) {
    await archiveFoundReport(d.id, closure);
    done += 1;
    onProgress?.(done, total);
  }

  return { lostCasesArchived: lostCases.length, foundReportsArchived: foundReports.length };
}
