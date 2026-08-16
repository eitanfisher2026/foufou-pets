import { collection, doc, getDoc, getDocs, increment, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, REPORT_STATUS, RECORD_STATUS } from '../shared/collections.js';
import { rankMatches, scoreMatch } from './matchingEngine.js';
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
  // surfacing as a fresh match candidate for other lost cases. Also skip
  // anything of a different species up front - scoreMatch would disqualify
  // it to 0 anyway (a cat and a dog are never the same animal), so there's
  // no reason to even show it as a ranked-but-hopeless candidate. A found
  // report from before species tracking existed has no species value and
  // still gets compared normally.
  const foundReports = reportsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (r) =>
        (r.status || RECORD_STATUS.ACTIVE) === RECORD_STATUS.ACTIVE &&
        (!lostCase.species || !r.species || r.species === lostCase.species)
    );

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
 * Re-scores just one lost-case/found-report pair, without touching any of
 * the case's other matches - useful after tweaking that one found report's
 * details (or the matching config itself) to see the effect immediately,
 * instead of re-running the full check against every found report again.
 * Keeps whatever review status the match already had (or picks the same
 * NEW/NO_MATCH default as a full check would for a pairing that's brand
 * new), and refreshes the case's denormalized counters from the full
 * current match set so the dashboard badge stays accurate.
 */
export async function checkSingleMatch(lostCaseId, foundReportId) {
  const [caseSnap, reportSnap] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId)),
    getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, foundReportId)),
  ]);
  if (!caseSnap.exists()) throw new Error('lost case not found');
  if (!reportSnap.exists()) throw new Error('found report not found');

  const config = await getMatchConfig();
  const { score, reasons, breakdown } = scoreMatch(caseSnap.data(), reportSnap.data(), config);

  const matchRef = doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', foundReportId);
  const prevSnap = await getDoc(matchRef);
  const status = prevSnap.exists() ? prevSnap.data().status : score === 0 ? REPORT_STATUS.NO_MATCH : REPORT_STATUS.NEW;
  await setDoc(matchRef, { foundReportId, score, reasons, breakdown, status, checkedAt: serverTimestamp() }, { merge: true });

  const allMatchesSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches'));
  const allMatches = allMatchesSnap.docs.map((d) => d.data());
  await setDoc(
    doc(db, COLLECTIONS.LOST_CASES, lostCaseId),
    {
      matchCount: allMatches.length,
      newMatchCount: allMatches.filter((m) => m.status === REPORT_STATUS.NEW).length,
      topMatchScore: allMatches.reduce((max, m) => Math.max(max, m.score || 0), 0),
      lastCheckedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { score, reasons, breakdown, status };
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

/**
 * The reverse direction of checkMatchesForLostCase: starting from one found/
 * seen report, compares it against every active lost case. Matches still
 * live in the same place (each lost case's own "matches" subcollection,
 * keyed by foundReportId) regardless of which side triggered the check -
 * there's only ever one match record per lost-case/found-report pair, so
 * checking from the found-report side and checking from the lost-case side
 * both read/write the exact same data. Reuses checkSingleMatch per
 * candidate rather than duplicating its scoring-and-persist logic.
 */
export async function checkMatchesForFoundReport(foundReportId) {
  const reportSnap = await getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, foundReportId));
  if (!reportSnap.exists()) throw new Error('found report not found');
  const report = reportSnap.data();

  const casesSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES));
  const lostCases = casesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (c) =>
        (c.status || RECORD_STATUS.ACTIVE) === RECORD_STATUS.ACTIVE &&
        (!report.species || !c.species || c.species === report.species)
    );

  const results = await Promise.all(
    lostCases.map(async (lostCase) => {
      const { score, reasons, breakdown, status } = await checkSingleMatch(lostCase.id, foundReportId);
      return { lostCase, score, reasons, breakdown, status };
    })
  );

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Reads back whatever matches were last persisted for this found report
 * (across every lost case's subcollection) without re-scoring anything -
 * the found-report-detail equivalent of getMatches, used on page load so
 * revisiting the page doesn't silently re-run a fresh check. No top-level
 * "matches" collection exists to query directly (see checkMatchesForFoundReport),
 * so this reads one match doc per lost case - fine at this project's scale,
 * and avoids needing a Firestore collection-group index just to list them.
 */
export async function getMatchesForFoundReport(foundReportId) {
  const casesSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES));
  const results = [];
  await Promise.all(
    casesSnap.docs.map(async (caseDoc) => {
      const matchSnap = await getDoc(doc(db, COLLECTIONS.LOST_CASES, caseDoc.id, 'matches', foundReportId));
      if (matchSnap.exists()) {
        results.push({ lostCase: { id: caseDoc.id, ...caseDoc.data() }, ...matchSnap.data() });
      }
    })
  );
  return results.sort((a, b) => b.score - a.score);
}

/**
 * The reverse of clearMatches: deletes this found report's match record
 * from every lost case that has one, including whatever status a person
 * already set. Deleting a doc that doesn't exist on a given lost case is
 * a harmless no-op, so this doesn't need to first look up which lost cases
 * actually have a match here.
 */
export async function clearMatchesForFoundReport(foundReportId) {
  const casesSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES));
  const batch = writeBatch(db);
  casesSnap.docs.forEach((caseDoc) => {
    batch.delete(doc(db, COLLECTIONS.LOST_CASES, caseDoc.id, 'matches', foundReportId));
  });
  await batch.commit();
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
