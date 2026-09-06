import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RECORD_STATUS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { petLabels } from '../shared/petLabels.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listFoundReportsPage, countFoundReports } from './dashboardApi.js';
import { FoundReportRow } from './RecordRows.jsx';
import BackLink from '../shared/BackLink.jsx';
import { usePaginatedList } from '../shared/usePaginatedList.js';

/**
 * The full found-reports list, on its own page instead of the dashboard's
 * default load - most people only ever need their own submission, and
 * matching already queries found reports independently, so this is purely
 * an on-demand "browse everything" view (mainly useful while testing).
 * Archived/resolved reports live in the archive page instead, not here.
 * Loaded a page at a time (see usePaginatedList) rather than the whole
 * species' worth up front - this list only ever grows, and nothing here
 * needs to see records beyond what's currently on screen.
 */
export default function FoundReportsListPage() {
  const { preferredSpecies, setPreferredSpecies, roleLoading } = useAuth();
  const [searchParams] = useSearchParams();
  // Set when arriving here from the match-analysis page after running out
  // of pending candidates to auto-advance through in the "report" direction
  // (see MatchAnalysisPage.jsx) - names the found report whose row to
  // scroll to and highlight below, and the species to switch to first if
  // that report isn't the one currently shown.
  const focusReportId = searchParams.get('focus');
  const focusSpecies = searchParams.get('focusSpecies');
  // Same server-side species filter and roleLoading gate as the dashboard's
  // lost-case list (see Dashboard.jsx/dashboardApi.js) - only the current
  // species is ever fetched, re-fetched on toggle switch.
  const { items: reports, loading, loadingMore, hasMore, error, loadMore } = usePaginatedList(
    (pageSize, cursor) => listFoundReportsPage(preferredSpecies, pageSize, cursor),
    [preferredSpecies],
    !roleLoading
  );
  const labels = petLabels(preferredSpecies);
  // Total count for the species, just to show pagination progress
  // ("20/64" etc.) - same idea as Dashboard.jsx's totalLostCount.
  const [totalCount, setTotalCount] = useState(null);
  useEffect(() => {
    if (roleLoading) return;
    setTotalCount(null);
    countFoundReports(preferredSpecies).then(setTotalCount);
  }, [preferredSpecies, roleLoading]);

  // Rare in practice (matches are always same-species, so this only fires
  // if the review that sent someone back here started from the other
  // species' tab) - same reasoning as Dashboard.jsx's equivalent effect.
  useEffect(() => {
    if (roleLoading || !focusSpecies || focusSpecies === preferredSpecies) return;
    setPreferredSpecies(focusSpecies);
  }, [roleLoading, focusSpecies, preferredSpecies]);

  // The report to scroll to and highlight might not be on the first loaded
  // page yet (see usePaginatedList) - keep paging in further batches until
  // it turns up or the list genuinely runs out.
  useEffect(() => {
    if (!focusReportId || loading || loadingMore || !hasMore) return;
    if (reports.some((r) => r.id === focusReportId)) return;
    loadMore();
  }, [focusReportId, reports, loading, loadingMore, hasMore]);

  useEffect(() => {
    if (!focusReportId) return;
    const el = document.getElementById(`report-${focusReportId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusReportId, reports]);

  const visibleReports = reports.filter((r) => r.status !== RECORD_STATUS.ARCHIVED && r.status !== RECORD_STATUS.RESOLVED);

  return (
    <div className="p-4">
      <BackLink to="/">חזרה לעמוד הראשי</BackLink>
      <h1 className="mb-4 text-xl font-bold text-slate-800">
        {labels.allFoundReportsTitle}
        {reports.length > 0 && (
          <span className="text-sm font-normal text-slate-400">
            {' '}
            ({reports.length}
            {totalCount != null && totalCount !== reports.length ? `/${totalCount}` : ''})
          </span>
        )}
      </h1>

      {loading && <p className="text-slate-500">טוען...</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">טעינת הרשימה נכשלה: {error}</p>}
      {!loading && visibleReports.length === 0 && !error && <p className="text-sm text-slate-400">אין דיווחים עדיין.</p>}

      <ul className="space-y-2">
        {visibleReports.map((r) => (
          <FoundReportRow key={r.id} report={r} statusLabels={FOUND_REPORT_STATUS_LABELS} highlighted={r.id === focusReportId} />
        ))}
      </ul>

      {!loading && hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
        >
          {loadingMore ? 'טוען...' : 'טען עוד'}
        </button>
      )}
    </div>
  );
}
