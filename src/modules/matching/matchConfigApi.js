import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { DEFAULT_MATCH_CONFIG } from './matchingEngine.js';

const CONFIG_DOC_PATH = ['config', 'matchWeights'];

// Firestore rejects an array directly containing another array ("nested
// arrays are not supported") - colorGroups is exactly that shape in memory
// (an array of color-name arrays), so it's wrapped as an array of {colors}
// maps only at the Firestore boundary. This was the actual cause behind
// color-group edits silently failing to save - every save attempt was
// throwing before the write ever reached the server.
function toFirestoreColorGroups(colorGroups) {
  return (colorGroups || []).map((colors) => ({ colors }));
}

function fromFirestoreColorGroups(raw) {
  return Array.isArray(raw) ? raw.map((g) => (Array.isArray(g?.colors) ? g.colors : [])) : DEFAULT_MATCH_CONFIG.colorGroups;
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
    parameters: Array.isArray(data.parameters) ? data.parameters : DEFAULT_MATCH_CONFIG.parameters,
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
