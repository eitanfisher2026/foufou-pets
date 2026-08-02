import { collection, getDocs, orderBy, query } from 'firebase/firestore';
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
