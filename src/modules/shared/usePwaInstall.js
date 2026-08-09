import { useEffect, useState } from 'react';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;

/**
 * Wraps the beforeinstallprompt flow captured in index.html (same pattern as
 * FouFou/Buli): Chrome/Edge/Android get a native install prompt; iOS Safari
 * never fires that event, so there it just reports "not installed" and the
 * caller shows manual "Add to Home Screen" instructions instead.
 */
export function usePwaInstall() {
  const [installed, setInstalled] = useState(isStandalone);
  const [canPrompt, setCanPrompt] = useState(!!window.__installPrompt);

  useEffect(() => {
    const onReady = () => setCanPrompt(true);
    const onInstalled = () => {
      setCanPrompt(false);
      setInstalled(true);
    };
    window.addEventListener('pwa_install_ready', onReady);
    window.addEventListener('pwa_installed', onInstalled);
    return () => {
      window.removeEventListener('pwa_install_ready', onReady);
      window.removeEventListener('pwa_installed', onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!window.__installPrompt) return false;
    window.__installPrompt.prompt();
    const choice = await window.__installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      window.__installPrompt = null;
      setCanPrompt(false);
    }
    return choice.outcome === 'accepted';
  }

  return { installed, canPrompt, isIOS, promptInstall };
}
