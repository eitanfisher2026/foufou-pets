import { useEffect, useState } from 'react';

const PAGE_SIZE = 20;

// Loads a Firestore-backed list one page at a time via `fetchPage(pageSize,
// cursor)`, which must resolve { items, cursor, hasMore } (see
// listLostCasesPage/listFoundReportsPage in dashboardApi.js). Resets back
// to the first page whenever `deps` changes (e.g. switching species)
// instead of appending onto a list that no longer matches. `enabled=false`
// holds off fetching entirely - for a fetch that depends on a value which
// itself loads asynchronously.
export function usePaginatedList(fetchPage, deps = [], enabled = true) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    setCursor(null);
    setHasMore(true);
    fetchPage(PAGE_SIZE, null)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setCursor(result.cursor);
        setHasMore(result.hasMore);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'שגיאה לא ידועה');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchPage(PAGE_SIZE, cursor);
      setItems((prev) => [...prev, ...result.items]);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err.message || 'שגיאה לא ידועה');
    } finally {
      setLoadingMore(false);
    }
  }

  return { items, loading, loadingMore, hasMore, error, loadMore };
}
