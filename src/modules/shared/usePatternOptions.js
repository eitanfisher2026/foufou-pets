import { useEffect, useState } from 'react';
import { CAT_PATTERNS } from './collections.js';
import { getPatternOptions } from './patternOptionsApi.js';

/**
 * Live, editable coat-pattern list for "תבנית פרווה" dropdowns - same
 * pattern as useColorOptions.js/useBreedOptions.js. Cat-only, so unlike
 * those two this doesn't take a species argument.
 */
export function usePatternOptions() {
  const [patterns, setPatterns] = useState(CAT_PATTERNS);
  useEffect(() => {
    let cancelled = false;
    getPatternOptions().then((result) => {
      if (!cancelled) setPatterns(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return patterns;
}
