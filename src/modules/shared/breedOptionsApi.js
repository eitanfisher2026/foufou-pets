import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { SPECIES, CAT_BREEDS, DOG_BREEDS } from './collections.js';

const CONFIG_DOC_PATH = ['config', 'breedOptions'];

// "אחר" (other) is a fixed catch-all, not a real breed choice - always
// appended last, never stored as part of the editable list.
const OTHER = 'אחר';

const DEFAULTS = {
  [SPECIES.CAT]: CAT_BREEDS,
  [SPECIES.DOG]: DOG_BREEDS,
};

/**
 * Reads the customizable breed list for one species from Firestore
 * (config/breedOptions, one doc shaped { cat: [...], dog: [...] } - the
 * pre-existing doc only ever had a "dog" field, which this reads the same
 * way), falling back to the built-in default list if that species has never
 * been saved. Used everywhere a "breed" dropdown is shown, and by the AI
 * extraction function, so a breed added here shows up in both without a
 * code change.
 */
export async function getBreedOptions(species) {
  const defaults = DEFAULTS[species] || DEFAULTS[SPECIES.CAT];
  const snap = await getDoc(doc(db, ...CONFIG_DOC_PATH));
  const saved = snap.exists() ? snap.data()[species] : null;
  const custom = Array.isArray(saved) ? saved : defaults.filter((b) => b !== OTHER);
  return [...custom, OTHER];
}

export async function saveBreedOptions(species, breeds) {
  await setDoc(doc(db, ...CONFIG_DOC_PATH), { [species]: breeds.filter((b) => b !== OTHER) }, { merge: true });
}
