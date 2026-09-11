import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';

const COST_SETTINGS_DOC_PATH = ['config', 'costSettings'];

export const DEFAULT_MONTHLY_FLAG_THRESHOLD_USD = 1;

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

/** The $ amount of AI spend in the current month that earns a user a flag in the cost breakdown. */
export async function getMonthlyFlagThreshold() {
  const snap = await getDoc(doc(db, ...COST_SETTINGS_DOC_PATH));
  return snap.exists() ? snap.data().monthlyFlagThresholdUsd ?? DEFAULT_MONTHLY_FLAG_THRESHOLD_USD : DEFAULT_MONTHLY_FLAG_THRESHOLD_USD;
}

export async function setMonthlyFlagThreshold(usd) {
  await setDoc(doc(db, ...COST_SETTINGS_DOC_PATH), { monthlyFlagThresholdUsd: usd }, { merge: true });
}
