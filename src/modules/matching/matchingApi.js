import { collection, doc, getDoc, getDocs, increment, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, REPORT_STATUS, RECORD_STATUS } from '../shared/collections.js';
import { rankMatches } from './matchingEngine.js';
import { getMatchConfig } from './matchConfigApi.js';

/**
 * Manual "check for matches" action: compares one lost case against every
 * found/seen report and persists the ranked, explained results so they can
 * be reviewed and their status tracked over time. No automatic/background
 * matching in the POC - this only runs when the button is pressed.
 */
export async function checkMatchesForLostCase(lostCaseId) {
  const caseSnap = await getDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId));
  if (!caseSnap.exists()) throw new Error('lost case not found');
  const lostCase = caseSnap.data();

  const reportsSnap = await getDocs(collection(db, COLLECTIONS.FOUND_REPORTS));
  // Skip anything not active: suspended/archived/resolved means that found
  // cat has already been checked/accounted for, so it shouldn't keep
  // surfacing as a fresh match candidate for other lost cases.
  const foundReports = reportsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => (r.status || RECORD_STATUS.ACTIVE) === RECORD_STATUS.ACTIVE);

  const config = await getMatchConfig();
  const ranked = rankMatches(lostCase, foundReports, config);

  // Re-checking shouldn't reset a match the owner already triaged back to
  // "new" - only brand-new matches (found reports that weren't compared
  // last time) start as new.
  const existingSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches'));
  const existingStatusById = Object.fromEntries(existingSnap.docs.map((d) => [d.id, d.data().status]));

  const batch = writeBatch(db);
  let newMatchCount = 0;
  for (const { report, score, reasons, breakdown } of ranked) {
    // A brand-new pairing that scores 0 (e.g. a disqualifying mismatch)
    // never needs a person's attention - defaulting it to NO_MATCH instead
    // of NEW keeps the "needs review" count meaningful. An existing status
    // is never overwritten here, even if a later re-check now scores 0 -
    // a person's own triage always outranks the automatic default.
    const status = existingStatusById[report.id] || (score === 0 ? REPORT_STATUS.NO_MATCH : REPORT_STATUS.NEW);
    if (status === REPORT_STATUS.NEW) newMatchCount += 1;
    const matchRef = doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', report.id);
    // breakdown is stored alongside score/reasons (not recomputed on demand)
    // so the "full analysis" view always shows exactly what was checked at
    // the time this match was last scored, even if the config changes later.
    batch.set(
      matchRef,
      { foundReportId: report.id, score, reasons, breakdown, status, checkedAt: serverTimestamp() },
      { merge: true }
    );
  }
  await batch.commit();

  // Denormalized onto the case doc so the dashboard can show a match badge
  // without reading every subcollection.
  await setDoc(
    doc(db, COLLECTIONS.LOST_CASES, lostCaseId),
    {
      matchCount: ranked.length,
      newMatchCount,
      topMatchScore: ranked[0]?.score ?? 0,
      lastCheckedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return ranked;
}

/**
 * Deletes every existing match record for a lost case - including whatever
 * status a person already set on them - so the next check starts every
 * pairing fresh as if it were being compared for the first time. Used when
 * a matching-config change (a new field, a re-tuned weight) makes the old
 * results worth throwing away rather than just refreshing scores in place.
 */
export async function clearMatches(lostCaseId) {
  const existingSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches'));
  const batch = writeBatch(db);
  existingSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function getMatches(lostCaseId) {
  const snap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.score - a.score);
}

export async function getMatch(lostCaseId, foundReportId) {
  const snap = await getDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', foundReportId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Updates one match's review status and keeps the lost case's denormalized
 * newMatchCount (used for the dashboard summary badge) in sync.
 */
export async function updateMatchStatus(lostCaseId, foundReportId, status) {
  const matchRef = doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', foundReportId);
  const prevSnap = await getDoc(matchRef);
  const wasNew = prevSnap.exists() && prevSnap.data().status === REPORT_STATUS.NEW;
  const isNew = status === REPORT_STATUS.NEW;

  await setDoc(matchRef, { status }, { merge: true });

  if (wasNew !== isNew) {
    await setDoc(
      doc(db, COLLECTIONS.LOST_CASES, lostCaseId),
      { newMatchCount: increment(isNew ? 1 : -1) },
      { merge: true }
    );
  }
}
