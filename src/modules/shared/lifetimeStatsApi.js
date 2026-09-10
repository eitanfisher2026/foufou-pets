import { doc, getDoc, increment, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { SPECIES } from './collections.js';

const DOC_PATH = ['config', 'lifetimeStats'];

// Cumulative, permanent counters - never reset, never derived from a live
// count of current documents. The whole point is to survive the records
// they're counting eventually being deleted (see archiveOldRecordsApi.js,
// which now hard-deletes rather than archives): a live "count how many
// lostCases exist" query would shrink every time old records get cleaned
// up, silently losing history. These increment once, at the moment the
// underlying event actually happens (a report created, a match confirmed),
// and keep that number forever regardless of what happens to the record
// afterward.
const FIELD_BY_SPECIES = (base, species) => `${base}${species === SPECIES.DOG ? 'Dog' : 'Cat'}`;

export async function getLifetimeStats() {
  const snap = await getDoc(doc(db, ...DOC_PATH));
  const data = snap.exists() ? snap.data() : {};
  return {
    lostReportedCat: data.lostReportedCat || 0,
    lostReportedDog: data.lostReportedDog || 0,
    foundReportedCat: data.foundReportedCat || 0,
    foundReportedDog: data.foundReportedDog || 0,
    matchedToOwnerCat: data.matchedToOwnerCat || 0,
    matchedToOwnerDog: data.matchedToOwnerDog || 0,
  };
}

// Each increment is its own small merge write, deliberately not batched
// with the record's own create/close write - a failure here (a permissions
// hiccup, a transient network error) is a lost audit number, not a lost
// report, so every call site fires-and-forgets this rather than letting it
// block or fail the actual user-facing action.
function incrementCounter(base, species) {
  return setDoc(doc(db, ...DOC_PATH), { [FIELD_BY_SPECIES(base, species)]: increment(1) }, { merge: true }).catch(() => {});
}

export function incrementLostReportedCounter(species) {
  return incrementCounter('lostReported', species);
}

export function incrementFoundReportedCounter(species) {
  return incrementCounter('foundReported', species);
}

export function incrementMatchedToOwnerCounter(species) {
  return incrementCounter('matchedToOwner', species);
}
