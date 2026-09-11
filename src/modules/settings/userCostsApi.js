import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';
import { ROLES } from '../users/usersApi.js';

const COST_SETTINGS_DOC_PATH = ['config', 'costSettings'];
const COST_LEDGER_DOC_PATH = ['config', 'costLedger'];

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
 * and current-calendar-month cost - written server-side by recordCost in
 * functions/index.js, never by the client. Only lists users who've
 * actually incurred cost, not everyone who's ever signed in.
 */
export async function listUserCosts() {
  const snap = await getDocs(collection(db, 'userCosts'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Site-wide AI cost - lifetime and this calendar month, each split the
 * same way the cost breakdown always showed it (extraction vs. visual-match
 * comparison). Returns null if the one-time monthly-tracking migration
 * (see runCostTrackingMigration below) hasn't been run yet.
 */
export async function getGlobalCosts() {
  const snap = await getDoc(doc(db, ...COST_LEDGER_DOC_PATH));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    aiCostUsd: data.aiCostUsd || 0,
    visualMatchCostUsd: data.visualMatchCostUsd || 0,
    currentMonthAiCostUsd: data.currentMonthAiCostUsd || 0,
    currentMonthVisualMatchCostUsd: data.currentMonthVisualMatchCostUsd || 0,
  };
}

/**
 * One-time admin action: moves every dollar of AI cost accumulated so far
 * into the lifetime totals above and starts this calendar month (and every
 * existing user's own "this month" figure) at $0 - see
 * migrateCostTrackingToMonthly in functions/index.js, which does the actual
 * writing (userCosts/{uid} can only ever be written server-side) and
 * refuses to run a second time.
 */
export async function runCostTrackingMigration() {
  const call = httpsCallable(functions, 'migrateCostTrackingToMonthly');
  const result = await call();
  return result.data;
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
