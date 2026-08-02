import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, REPORT_STATUS } from '../shared/collections.js';
import { rankMatches } from './matchingEngine.js';

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
  const foundReports = reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const ranked = rankMatches(lostCase, foundReports);

  const batch = writeBatch(db);
  for (const { report, score, reasons } of ranked) {
    const matchRef = doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', report.id);
    batch.set(
      matchRef,
      {
        foundReportId: report.id,
        score,
        reasons,
        status: REPORT_STATUS.NEW,
        checkedAt: serverTimestamp(),
      },
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
      topMatchScore: ranked[0]?.score ?? 0,
      lastCheckedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return ranked;
}

export async function getMatches(lostCaseId) {
  const snap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.score - a.score);
}

export async function updateMatchStatus(lostCaseId, foundReportId, status) {
  const batch = writeBatch(db);
  batch.set(
    doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', foundReportId),
    { status },
    { merge: true }
  );
  await batch.commit();
}
