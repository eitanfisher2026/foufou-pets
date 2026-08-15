import { collection, getCountFromServer, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';

export async function listLostCases() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.LOST_CASES), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listFoundReports() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.FOUND_REPORTS), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// A count-only aggregation query (no documents actually transferred) -
// cheap enough to run right on the dashboard, unlike fetching the whole
// found-reports list just to show a number next to its link. Counts every
// status (not just active) for that species, so it won't exactly match
// FoundReportsListPage's filtered "active only" count - close enough for a
// glance, and avoids needing a composite index for a status filter too.
export async function countFoundReports(species) {
  const snap = await getCountFromServer(query(collection(db, COLLECTIONS.FOUND_REPORTS), where('species', '==', species)));
  return snap.data().count;
}
