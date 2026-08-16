import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';

const DOC_PATH = ['config', 'aboutContent'];

const DEFAULT_TEXT =
  'איתור חיות מחמד היא מערכת לניהול חיפוש אחר חיות מחמד אבודות, ולהתאמה בין דיווחים על אבידה לבין דיווחים על חיות שנראו או נמצאו.';

/**
 * Admin-editable "about" text, stored at config/aboutContent (same
 * read/write rule as every other config doc: everyone signed-in can read,
 * only an admin can write - see firestore.rules). Hebrew only, no en/he
 * split - this app has no English UI to begin with.
 */
export async function getAboutContent() {
  const snap = await getDoc(doc(db, ...DOC_PATH));
  return snap.exists() && snap.data().text ? snap.data().text : DEFAULT_TEXT;
}

export async function saveAboutContent(text) {
  await setDoc(doc(db, ...DOC_PATH), { text }, { merge: true });
}
