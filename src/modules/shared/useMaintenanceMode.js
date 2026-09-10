import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { MAINTENANCE_DOC_PATH } from './maintenanceApi.js';

/**
 * Live subscription to the single admin on/off switch (config/maintenance)
 * that takes the whole app offline for everyone except admins - lets an
 * admin ship and verify a change live under their own account (see
 * App.jsx/SettingsPage.jsx) without regular users seeing a mid-deploy,
 * half-working app. A live onSnapshot rather than a one-time read, unlike
 * this project's other config hooks (useColorOptions etc.) - the whole
 * point is that flipping it in Settings takes effect immediately for every
 * other tab someone already has open, not just on their next reload. Only
 * subscribes once signed in (`active`) - firestore.rules' config/{docId}
 * rule already requires signedIn() to read, and a signed-out visitor sees
 * the normal login screen regardless of this value.
 */
export function useMaintenanceMode(active) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!active) return;
    return onSnapshot(doc(db, ...MAINTENANCE_DOC_PATH), (snap) => {
      setEnabled(!!snap.data()?.enabled);
    });
  }, [active]);

  return enabled;
}
