import { collection, getCountFromServer, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';

// Sorted client-side rather than via an orderBy('createdAt') alongside the
// species filter - a where(equality) + orderBy(different field) query needs
// a composite Firestore index; sorting after the fact avoids that entirely
// for a per-species list that's small enough not to need one.
function byCreatedAtDesc(a, b) {
  return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
}

// `species` is optional - omit it for the few callers that genuinely need
// every record regardless of species (the cost dashboard, which totals AI
// spend across both). Everywhere someone is working one species at a time
// (the working dashboard, the found-reports browse page), passing it here
// means Firestore only ever sends back the records that page can actually
// show, instead of both species' worth every time.
export async function listLostCases(species) {
  const base = collection(db, COLLECTIONS.LOST_CASES);
  if (!species) {
    const snap = await getDocs(query(base, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const snap = await getDocs(query(base, where('species', '==', species)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byCreatedAtDesc);
}

export async function listFoundReports(species) {
  const base = collection(db, COLLECTIONS.FOUND_REPORTS);
  if (!species) {
    const snap = await getDocs(query(base, orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const snap = await getDocs(query(base, where('species', '==', species)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byCreatedAtDesc);
}

// Paginated variants of the two lists above, for the default browse views
// (Dashboard's open-cases list, FoundReportsListPage) - those fetch every
// record for the species up front today, which only gets slower as the
// collection grows. Needs species+createdAt as a real composite index
// (see firestore.indexes.json) since combining an equality filter with an
// orderBy on a different field isn't covered by Firestore's automatic
// single-field indexes. Status (archived/resolved) is still filtered
// client-side per page, same as before - folding it into the query too
// would need status to be part of that same composite index in a way
// that's fragile against adding more statuses later, for a filter that's
// cheap to apply to 20 docs at a time anyway. Search still needs the
// complete, unpaginated list to search correctly (see Dashboard.jsx) -
// only the default browse view is paginated.
export async function listLostCasesPage(species, pageSize, cursor) {
  const constraints = [where('species', '==', species), orderBy('createdAt', 'desc'), limit(pageSize)];
  if (cursor) constraints.push(startAfter(cursor));
  const snap = await getDocs(query(collection(db, COLLECTIONS.LOST_CASES), ...constraints));
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.docs.length === pageSize,
  };
}

export async function listFoundReportsPage(species, pageSize, cursor) {
  const constraints = [where('species', '==', species), orderBy('createdAt', 'desc'), limit(pageSize)];
  if (cursor) constraints.push(startAfter(cursor));
  const snap = await getDocs(query(collection(db, COLLECTIONS.FOUND_REPORTS), ...constraints));
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.docs.length === pageSize,
  };
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
