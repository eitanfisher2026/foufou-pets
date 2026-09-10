import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';

// Own Firestore doc (config/maintenance), independent of any other
// project's equivalent feature - already covered by firestore.rules'
// generic config/{docId} rule (any signed-in user can read, only an admin
// can write), no rule of its own needed. See useMaintenanceMode.js for the
// live-subscription side of this, and SettingsPage.jsx for the admin toggle.
export const MAINTENANCE_DOC_PATH = ['config', 'maintenance'];

export async function setMaintenanceMode(enabled) {
  await setDoc(doc(db, ...MAINTENANCE_DOC_PATH), { enabled }, { merge: true });
}
