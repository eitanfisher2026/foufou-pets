import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { ROLES } from '../users/usersApi.js';

const COST_SETTINGS_DOC_PATH = ['config', 'costSettings'];

// Regular users are the ones a flag actually needs to catch (a stranger
// with a stolen/copied token, or a confused user re-scanning the same
// report over and over) - editors legitimately do more AI-heavy work
// (bulk rescans, the photo-similarity backfill in Settings), so they get a
// higher bar before it's worth a second look. Admins have no threshold at
// all: they're trusted, known individuals (same reasoning enforceAiRateLimit
// already uses to exempt them from the hourly call cap in functions/index.js),
// not the anonymous-usage case this flag exists to catch.
export const DEFAULT_REGULAR_MONTHLY_FLAG_THRESHOLD_USD = 1;
export const DEFAULT_EDITOR_MONTHLY_FLAG_THRESHOLD_USD = 5;

/**
 * Admin-only: every user who has ever triggered an AI call (species detect,
 * screenshot extraction, or visual match comparison), with their lifetime
 * and current-calendar-month cost - written server-side by recordUserCost
 * in functions/index.js, never by the client. Only lists users who've
 * actually incurred cost, not everyone who's ever signed in.
 */
export async function listUserCosts() {
  const snap = await getDocs(collection(db, 'userCosts'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** The $ amounts of this-month AI spend that earn a regular/editor user a flag in the cost breakdown. */
export async function getMonthlyFlagThresholds() {
  const snap = await getDoc(doc(db, ...COST_SETTINGS_DOC_PATH));
  const data = snap.exists() ? snap.data() : {};
  return {
    [ROLES.REGULAR]: data.regularMonthlyFlagThresholdUsd ?? DEFAULT_REGULAR_MONTHLY_FLAG_THRESHOLD_USD,
    [ROLES.EDITOR]: data.editorMonthlyFlagThresholdUsd ?? DEFAULT_EDITOR_MONTHLY_FLAG_THRESHOLD_USD,
  };
}

export async function setMonthlyFlagThresholds({ regular, editor }) {
  await setDoc(
    doc(db, ...COST_SETTINGS_DOC_PATH),
    { regularMonthlyFlagThresholdUsd: regular, editorMonthlyFlagThresholdUsd: editor },
    { merge: true }
  );
}
