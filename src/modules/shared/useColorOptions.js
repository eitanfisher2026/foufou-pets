import { useEffect, useState } from 'react';
import { SPECIES, CAT_COLORS, DOG_COLORS } from './collections.js';
import { getColorOptions } from './colorOptionsApi.js';

const DEFAULTS = {
  [SPECIES.CAT]: CAT_COLORS,
  [SPECIES.DOG]: DOG_COLORS,
};

/**
 * Live, editable color list for "צבע" dropdowns, for one species - starts
 * with that species' built-in default and swaps in the Firestore-saved
 * list (config/colorOptions) once it loads, so a color someone adds in
 * settings shows up here too. Re-fetches whenever `species` changes, so a
 * form switching between cat/dog mid-edit always shows the right list.
 */
export function useColorOptions(species) {
  const [colors, setColors] = useState(DEFAULTS[species] || DEFAULTS[SPECIES.CAT]);
  useEffect(() => {
    let cancelled = false;
    getColorOptions(species).then((result) => {
      if (!cancelled) setColors(result);
    });
    return () => {
      cancelled = true;
    };
  }, [species]);
  return colors;
}
