import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Opening the installed app straight into a deep screen (a shared link, the
 * share-target redirect, reopening a bookmarked URL) starts the browser's
 * history with only that one entry - the phone's back button then has
 * nothing "beneath" it to go back to, so it exits the app entirely instead
 * of acting like an in-app back button. Runs once per fresh app open: if
 * this is the very first history entry and it isn't already the dashboard,
 * synthesizes a dashboard entry underneath it (via react-router's own
 * navigate, not a raw history.pushState, so its internal location state
 * stays in sync with the real URL) - so the first back press always lands
 * in-app first.
 */
export function useHomeHistoryGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (sessionStorage.getItem('appBooted')) return;
    sessionStorage.setItem('appBooted', '1');

    if (window.history.length <= 1 && location.pathname !== '/') {
      const target = location.pathname + location.search;
      navigate('/', { replace: true });
      navigate(target);
    }
    // Runs once on the very first mount of the routed app - re-checking on
    // every navigation would re-trigger for legitimate in-app history too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
