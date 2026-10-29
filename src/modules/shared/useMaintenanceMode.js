import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { MAINTENANCE_DOC_PATH } from './maintenanceApi.js';

/**
 * Live subscription to config/maintenance - both admin switches there
 * (maintenance mode and the full system pause, see maintenanceApi.js). A
 * live onSnapshot rather than a one-time read, unlike this project's other
 * config hooks - flipping either switch in Settings has to take effect
 * immediately for every tab someone already has open, not on their next
 * reload. `blocked` is true when either one should keep non-admins out.
 */
export function useMaintenanceMode(active = true) {
  const [state, setState] = useState({ enabled: false, paused: false, message: '' });

  useEffect(() => {
    if (!active) return;
    return onSnapshot(
      doc(db, ...MAINTENANCE_DOC_PATH),
      (snap) => {
        const d = snap.data() || {};
        setState({ enabled: !!d.enabled, paused: !!d.paused, message: d.pauseMessage || '' });
      },
      () => {}
    );
  }, [active]);

  return { ...state, blocked: state.enabled || state.paused };
}
