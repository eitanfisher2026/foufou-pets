import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { DOG_BREEDS } from './collections.js';

const CONFIG_DOC_PATH = ['config', 'breedOptions'];

// "אחר" (other) is a fixed catch-all, not a real breed choice - always
// appended last, never stored as part of the editable list. Dog-only for
// now - cats keep a free-text breed field (see lostFieldMapping.js).
const OTHER = 'אחר';

export async function getDogBreedOptions() {
  const snap = await getDoc(doc(db, ...CONFIG_DOC_PATH));
  const custom = snap.exists() && Array.isArray(snap.data().dog) ? snap.data().dog : DOG_BREEDS.filter((b) => b !== OTHER);
  return [...custom, OTHER];
}

export async function saveDogBreedOptions(breeds) {
  await setDoc(doc(db, ...CONFIG_DOC_PATH), { dog: breeds.filter((b) => b !== OTHER) }, { merge: true });
}
