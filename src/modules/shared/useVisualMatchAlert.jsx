import { useState } from 'react';
import VisualMatchAlertDialog from './VisualMatchAlertDialog.jsx';

/**
 * Queues up notable AI photo-similarity verdicts (see NOTABLE_VISUAL_VERDICTS
 * in matchingApi.js) from a scan action and shows them in a dismiss-only
 * popup - same usage pattern as useConfirm().
 *
 *   const { notify, dialog } = useVisualMatchAlert();
 *   notify(result.visualMatches);
 *   ...
 *   return <div>...{dialog}</div>;
 *
 * A no-op when the list is empty, so every call site can call notify()
 * unconditionally after a scan without checking length itself first.
 */
export function useVisualMatchAlert() {
  const [matches, setMatches] = useState(null);

  function notify(newMatches) {
    if (newMatches && newMatches.length > 0) setMatches(newMatches);
  }

  const dialog = matches ? <VisualMatchAlertDialog matches={matches} onClose={() => setMatches(null)} /> : null;

  return { notify, dialog };
}
