import { useEffect, useState } from 'react';
import { CAT_COLORS } from './collections.js';
import { getColorOptions } from './colorOptionsApi.js';

/**
 * Live, editable color list for "צבע" dropdowns - starts with the built-in
 * default and swaps in the Firestore-saved list (config/colorOptions) once
 * it loads, so a color someone adds in settings shows up here too.
 */
export function useColorOptions() {
  const [colors, setColors] = useState(CAT_COLORS);
  useEffect(() => {
    getColorOptions().then(setColors);
  }, []);
  return colors;
}
