import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { DEFAULT_MATCH_CONFIG } from './matchingEngine.js';

const CONFIG_DOC_PATH = ['config', 'matchWeights'];

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
    colorGroups: Array.isArray(data.colorGroups) ? data.colorGroups : DEFAULT_MATCH_CONFIG.colorGroups,
  };
}

export async function saveMatchConfig(config) {
  await setDoc(doc(db, ...CONFIG_DOC_PATH), config);
}

export async function resetMatchConfig() {
  await setDoc(doc(db, ...CONFIG_DOC_PATH), DEFAULT_MATCH_CONFIG);
  return DEFAULT_MATCH_CONFIG;
}
