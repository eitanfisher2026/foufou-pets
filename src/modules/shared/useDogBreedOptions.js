import { useEffect, useState } from 'react';
import { DOG_BREEDS } from './collections.js';
import { getDogBreedOptions } from './breedOptionsApi.js';

/**
 * Live, editable dog-breed list for "גזע" dropdowns - starts with the
 * built-in default and swaps in the Firestore-saved list
 * (config/breedOptions) once it loads, so a breed someone adds in settings
 * shows up here too. Dog-only - cats keep a free-text breed field.
 */
export function useDogBreedOptions() {
  const [breeds, setBreeds] = useState(DOG_BREEDS);
  useEffect(() => {
    getDogBreedOptions().then(setBreeds);
  }, []);
  return breeds;
}
