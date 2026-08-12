import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { SPECIES, CAT_COLORS, DOG_COLORS } from './collections.js';

const CONFIG_DOC_PATH = ['config', 'colorOptions'];

// "אחר" (other) is a fixed catch-all, not a real color choice - always
// appended last, never stored as part of the editable list.
const OTHER = 'אחר';

const DEFAULTS = {
  [SPECIES.CAT]: CAT_COLORS,
  [SPECIES.DOG]: DOG_COLORS,
};

/**
 * Reads the customizable color list for one species from Firestore
 * (config/colorOptions, one doc shaped { cat: [...], dog: [...] }),
 * falling back to the built-in default list if that species has never been
 * saved (fresh project, or before the settings panel is used for the first
 * time). Used everywhere a "color" dropdown is shown, and by the AI
 * extraction function, so a color added here shows up in both without a
 * code change.
 */
export async function getColorOptions(species) {
  const defaults = DEFAULTS[species] || DEFAULTS[SPECIES.CAT];
  const snap = await getDoc(doc(db, ...CONFIG_DOC_PATH));
  const saved = snap.exists() ? snap.data()[species] : null;
  const custom = Array.isArray(saved) ? saved : defaults.filter((c) => c !== OTHER);
  return [...custom, OTHER];
}

export async function saveColorOptions(species, colors) {
  await setDoc(doc(db, ...CONFIG_DOC_PATH), { [species]: colors.filter((c) => c !== OTHER) }, { merge: true });
}
