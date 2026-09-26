// Two values that look identical on screen can be different strings -
// mainly the Hebrew geresh (׳) vs a plain apostrophe (') in a breed/color
// name like "פינצ'ר", which are visually indistinguishable but compare as
// unequal. That let duplicates slip into a saved options list (one variant
// removed, the other silently stayed, then the code-default merge in
// getBreedOptions/getColorOptions/getPatternOptions re-added the removed
// variant) and never let a straight .filter(v => v !== target) actually
// remove every look-alike copy. Normalizing before comparing/deduping
// treats look-alikes as the same value everywhere they're read or edited.
export function normalizeOption(value) {
  return value.trim().normalize('NFC');
}

export function dedupeOptions(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = normalizeOption(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}
