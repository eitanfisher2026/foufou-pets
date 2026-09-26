// Two values that look identical on screen can be different strings - most
// often an apostrophe-like character typed differently in a breed/color
// name like "פינצ'ר" (Hebrew geresh ׳, straight apostrophe ', curly quote
// ’, backtick `, or acute accent ´ - five distinct code points that all
// render as the same little mark, and are NOT Unicode-equivalent, so even
// .normalize('NFC') treats them as different characters). That let
// duplicates slip into a saved options list (one variant removed, the
// other silently stayed, then the code-default merge in
// getBreedOptions/getColorOptions/getPatternOptions re-added the removed
// variant) and never let a straight .filter(v => v !== target) actually
// remove every look-alike copy. Collapsing all of them to one canonical
// mark before comparing/deduping treats look-alikes as the same value
// everywhere options are read or edited.
const APOSTROPHE_LIKE = /['’‘`´׳]/g;

export function normalizeOption(value) {
  return value.trim().normalize('NFC').replace(APOSTROPHE_LIKE, "'");
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
