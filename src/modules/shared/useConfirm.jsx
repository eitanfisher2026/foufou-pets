import { useCallback, useState } from 'react';
import ConfirmDialog from './ConfirmDialog.jsx';

/**
 * In-app replacement for window.confirm(), so every "are you sure?" in the
 * app looks the same instead of the browser's native dialog.
 *
 * Usage:
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm('להסיר?'))) return;
 *   ...
 *   return <div>...{dialog}</div>;
 */
export function useConfirm() {
  const [pending, setPending] = useState(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => setPending({ message, options, resolve }));
  }, []);

  function settle(result) {
    pending?.resolve(result);
    setPending(null);
  }

  const dialog = pending ? (
    <ConfirmDialog
      message={pending.message}
      confirmLabel={pending.options.confirmLabel}
      cancelLabel={pending.options.cancelLabel}
      danger={pending.options.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, dialog };
}
