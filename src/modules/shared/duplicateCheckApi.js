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

// Digits-only comparison so "054-485-3364", "0544853364" and "+972-54-485-3364"
// all match each other - contactPhone is free text, never format-enforced,
// so a raw string match would miss the large majority of real duplicates.
// Exported so lostReportApi.js/foundReportApi.js can compute the same
// normalizedPhone value they save alongside contactPhone (see
// findDuplicatesByContactPhone below for why that field exists).
export function normalizePhone(phone) {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  return digits;
}

// Below this many digits a match is more likely a coincidence (a short
// partial number, or two people who each left a near-empty field) than a
// real duplicate - not worth flagging.
const MIN_PHONE_DIGITS = 7;

/**
 * Second duplicate signal, alongside source URL: a contact phone number
 * that already appears on another record of the same type. Queries the
 * denormalized `normalizedPhone` field (set alongside contactPhone by
 * createLostCase/updateLostCase/createFoundReport/updateFoundReport) rather
 * than fetching every record with a non-empty phone and comparing client-
 * side - this used to read the ENTIRE collection on every single report
 * submission (the app's most frequent write), which only gets more
 * expensive as the collection grows. A record saved before normalizedPhone
 * existed won't match here until it's next edited/re-saved.
 */
async function findDuplicatesByContactPhone(recordType, contactPhone) {
  const digits = normalizePhone(contactPhone);
  if (digits.length < MIN_PHONE_DIGITS) return [];
  const collectionName = recordType === 'lost' ? COLLECTIONS.LOST_CASES : COLLECTIONS.FOUND_REPORTS;
  const snap = await getDocs(query(collection(db, collectionName), where('normalizedPhone', '==', digits)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Combines the source-url and contact-phone signals into one deduped list -
 * either one matching is reason enough to warn, and a record that matches
 * on both only appears once, tagged with everything it matched on so the
 * warning dialog can say why.
 */
export async function findDuplicates(recordType, { sourceUrl, contactPhone } = {}) {
  const [byUrl, byPhone] = await Promise.all([
    findDuplicatesBySourceUrl(recordType, sourceUrl),
    findDuplicatesByContactPhone(recordType, contactPhone),
  ]);
  const byId = new Map();
  for (const m of byUrl) byId.set(m.id, { ...m, matchedOn: ['sourceUrl'] });
  for (const m of byPhone) {
    const existing = byId.get(m.id);
    byId.set(m.id, existing ? { ...existing, matchedOn: [...existing.matchedOn, 'contactPhone'] } : { ...m, matchedOn: ['contactPhone'] });
  }
  return [...byId.values()];
}

/**
 * Same check, but for the smart-add flow where lost-vs-found isn't known
 * yet at the moment a link is pulled in (that's only decided once
 * extraction runs) - checks both collections and tags each match with its
 * own recordType so a caller/dialog that doesn't know the type in advance
 * can still render each match correctly.
 */
export async function findDuplicatesBySourceUrlAnyType(sourceUrl) {
  const [lost, found] = await Promise.all([
    findDuplicatesBySourceUrl('lost', sourceUrl),
    findDuplicatesBySourceUrl('found', sourceUrl),
  ]);
  return [
    ...lost.map((m) => ({ ...m, recordType: 'lost', matchedOn: ['sourceUrl'] })),
    ...found.map((m) => ({ ...m, recordType: 'found', matchedOn: ['sourceUrl'] })),
  ];
}
