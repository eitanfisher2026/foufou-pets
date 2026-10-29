import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';

// Own Firestore doc (config/maintenance), holding two separate switches:
// `enabled` (maintenance - non-admins see a "back in a few minutes" screen,
// everything else keeps running) and `paused` (a full stop - non-admins
// see the pause message, and every money-costing server function plus the
// weekly cleanup refuse to run, see isSystemPaused in functions/index.js).
// Readable before sign-in (see firestore.rules) so a visitor sees the
// pause message instead of a sign-in screen; only an admin can write it.
export const MAINTENANCE_DOC_PATH = ['config', 'maintenance'];

export const PAUSE_DEFAULT_MESSAGE =
  'המערכת מושהית זמנית. לבקשה לחידוש הפעלה אפשר לפנות במייל ל-eitanfisher.apps@gmail.com';

export async function setMaintenanceMode(enabled) {
  await setDoc(doc(db, ...MAINTENANCE_DOC_PATH), { enabled }, { merge: true });
}

export async function setSystemPaused(paused) {
  await setDoc(doc(db, ...MAINTENANCE_DOC_PATH), { paused }, { merge: true });
}

export async function savePauseMessage(message) {
  await setDoc(doc(db, ...MAINTENANCE_DOC_PATH), { pauseMessage: message.trim() || PAUSE_DEFAULT_MESSAGE }, { merge: true });
}
