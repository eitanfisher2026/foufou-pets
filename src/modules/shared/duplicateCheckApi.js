import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from './collections.js';

/**
 * Looks for existing lost cases / found reports that share the exact same
 * source URL - the first (and for now only) duplicate signal; more
 * conditions can be added here later without changing how callers use this.
 * Only checks within the same record type (a lost case only against other
 * lost cases, a found report only against other found reports), since a
 * shared URL across the two would be a different post being categorized
 * differently, not the same report entered twice. Archived/resolved records
 * are still included - re-entering an already-closed case's post is still
 * worth flagging.
 */
export async function findDuplicatesBySourceUrl(recordType, sourceUrl) {
  const url = (sourceUrl || '').trim();
  if (!url) return [];
  const collectionName = recordType === 'lost' ? COLLECTIONS.LOST_CASES : COLLECTIONS.FOUND_REPORTS;
  const snap = await getDocs(query(collection(db, collectionName), where('sourceUrl', '==', url)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
