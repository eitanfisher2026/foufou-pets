import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { CAT_COLORS } from './collections.js';

const CONFIG_DOC_PATH = ['config', 'colorOptions'];

// "אחר" (other) is a fixed catch-all, not a real color choice - always
// appended last, never stored as part of the editable list.
const OTHER = 'אחר';

/**
 * Reads the customizable cat-color list from Firestore, falling back to the
 * built-in CAT_COLORS if it's never been saved (fresh project, or before
 * the settings panel is used for the first time). Used everywhere a "color"
 * dropdown is shown, and by the AI extraction function, so a color added
 * here shows up in both without a code change.
 */
export async function getColorOptions() {
  const snap = await getDoc(doc(db, ...CONFIG_DOC_PATH));
  const custom = snap.exists() && Array.isArray(snap.data().colors) ? snap.data().colors : CAT_COLORS.filter((c) => c !== OTHER);
  return [...custom, OTHER];
}

export async function saveColorOptions(colors) {
  await setDoc(doc(db, ...CONFIG_DOC_PATH), { colors: colors.filter((c) => c !== OTHER) });
}
