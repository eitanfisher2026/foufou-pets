import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { CAT_PATTERNS } from './collections.js';

const CONFIG_DOC_PATH = ['config', 'patternOptions'];

// "אחר" (other) is a fixed catch-all, not a real pattern choice - always
// appended last, never stored as part of the editable list. Cat-only -
// dogs don't get this field at all (see functions/index.js).
const OTHER = 'אחר';

/**
 * Reads the customizable coat-pattern list from Firestore
 * (config/patternOptions, { cat: [...] }), falling back to the built-in
 * default if never saved. Same live-editable convention as
 * colorOptionsApi.js/breedOptionsApi.js, just for one species since pattern
 * only applies to cats - including the same merge-in of any new code
 * default not already present, so a pattern added to CAT_PATTERNS in code
 * reaches an already-customized list automatically.
 */
export async function getPatternOptions() {
  const defaultsWithoutOther = CAT_PATTERNS.filter((p) => p !== OTHER);
  const snap = await getDoc(doc(db, ...CONFIG_DOC_PATH));
  const saved = snap.exists() ? snap.data().cat : null;
  const custom = Array.isArray(saved)
    ? [...saved, ...defaultsWithoutOther.filter((p) => !saved.includes(p))]
    : defaultsWithoutOther;
  return [...custom, OTHER];
}

export async function savePatternOptions(patterns) {
  await setDoc(doc(db, ...CONFIG_DOC_PATH), { cat: patterns.filter((p) => p !== OTHER) }, { merge: true });
}
