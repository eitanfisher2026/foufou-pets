import { useEffect, useState } from 'react';
import { SPECIES, CAT_BREEDS, DOG_BREEDS } from './collections.js';
import { getBreedOptions } from './breedOptionsApi.js';

const DEFAULTS = {
  [SPECIES.CAT]: CAT_BREEDS,
  [SPECIES.DOG]: DOG_BREEDS,
};

/**
 * Live, editable breed list for "גזע" dropdowns, for one species - same
 * pattern as useColorOptions.js. Both species get a real picklist now (a
 * first "mixed/street" entry covers the common default case for either).
 */
export function useBreedOptions(species) {
  const [breeds, setBreeds] = useState(DEFAULTS[species] || DEFAULTS[SPECIES.CAT]);
  useEffect(() => {
    let cancelled = false;
    getBreedOptions(species).then((result) => {
      if (!cancelled) setBreeds(result);
    });
    return () => {
      cancelled = true;
    };
  }, [species]);
  return breeds;
}
