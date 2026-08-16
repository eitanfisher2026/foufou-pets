import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { DEFAULT_MATCH_CONFIG } from './matchingEngine.js';

const CONFIG_DOC_PATH = ['config', 'matchWeights'];

// Firestore rejects an array directly containing another array ("nested
// arrays are not supported") - a species' groups are exactly that shape in
// memory (an array of color-name arrays), so each is wrapped as an array of
// {colors} maps only at the Firestore boundary. This was the actual cause
// behind color-group edits silently failing to save - every save attempt
// was throwing before the write ever reached the server.
//
// colorGroups itself is keyed by species (see DEFAULT_COLOR_GROUPS in
// matchingEngine.js) - CAT_COLORS and DOG_COLORS overlap on several literal
// values, so one flat group list had no way to keep a cat grouping from
// also silently applying to dogs. A doc saved before that split was a flat
// array, not an object with cat/dog keys - fromFirestoreColorGroups can't
// tell which of those old groups were "really" about cats vs. dogs (that
// distinction never existed), so it falls back to the code default per
// species rather than guess; the mixed groups need re-entering once, this
// time correctly scoped.
function toFirestoreColorGroups(colorGroupsBySpecies) {
  const result = {};
  for (const species of Object.keys(colorGroupsBySpecies || {})) {
    result[species] = (colorGroupsBySpecies[species] || []).map((colors) => ({ colors }));
  }
  return result;
}

function fromFirestoreColorGroups(raw) {
  const result = {};
  for (const species of Object.keys(DEFAULT_MATCH_CONFIG.colorGroups)) {
    const speciesRaw = raw && !Array.isArray(raw) ? raw[species] : null;
    result[species] = Array.isArray(speciesRaw)
      ? speciesRaw.map((g) => (Array.isArray(g?.colors) ? g.colors : []))
      : DEFAULT_MATCH_CONFIG.colorGroups[species] || [];
  }
  return result;
}

// hasFluffyTail, colorDescription, lastSeenLocation/location were retired
// as standalone fields (folded into markings/neighborhood) - a parameter
// saved before that change could still reference one of them, which would
// never contribute to a score (the field is always empty now) and shows up
// oddly in the settings panel (a field dropdown with no matching option).
// Silently drop any such leftover on load rather than requiring a manual
// settings-panel cleanup.
const RETIRED_FIELDS = new Set(['hasFluffyTail', 'colorDescription', 'lastSeenLocation', 'location']);

function dropRetiredParameters(parameters) {
  return (Array.isArray(parameters) ? parameters : DEFAULT_MATCH_CONFIG.parameters).filter(
    (p) => !RETIRED_FIELDS.has(p.lostField) && !RETIRED_FIELDS.has(p.foundField)
  );
}

/**
 * Reads the live matching-algorithm config from Firestore, falling back to
 * DEFAULT_MATCH_CONFIG if it's never been saved (e.g. a fresh project, or
 * before the settings panel is used for the first time).
 */
export async function getMatchConfig() {
  const snap = await getDoc(doc(db, ...CONFIG_DOC_PATH));
  if (!snap.exists()) return DEFAULT_MATCH_CONFIG;
  const data = snap.data();
  return {
    relativeScoring: data.relativeScoring ?? DEFAULT_MATCH_CONFIG.relativeScoring,
    parameters: dropRetiredParameters(data.parameters),
    colorGroups: fromFirestoreColorGroups(data.colorGroups),
    confidenceColors: { ...DEFAULT_MATCH_CONFIG.confidenceColors, ...data.confidenceColors },
  };
}

export async function saveMatchConfig(config) {
  await setDoc(doc(db, ...CONFIG_DOC_PATH), { ...config, colorGroups: toFirestoreColorGroups(config.colorGroups) });
}

export async function resetMatchConfig() {
  await setDoc(doc(db, ...CONFIG_DOC_PATH), { ...DEFAULT_MATCH_CONFIG, colorGroups: toFirestoreColorGroups(DEFAULT_MATCH_CONFIG.colorGroups) });
  return DEFAULT_MATCH_CONFIG;
}
