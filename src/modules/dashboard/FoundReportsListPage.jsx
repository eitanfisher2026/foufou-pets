import { RECORD_STATUS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { petLabels } from '../shared/petLabels.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listFoundReportsPage } from './dashboardApi.js';
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
  const { preferredSpecies, roleLoading } = useAuth();
  // Same server-side species filter and roleLoading gate as the dashboard's
  // lost-case list (see Dashboard.jsx/dashboardApi.js) - only the current
  // species is ever fetched, re-fetched on toggle switch.
  const { items: reports, loading, loadingMore, hasMore, error, loadMore } = usePaginatedList(
    (pageSize, cursor) => listFoundReportsPage(preferredSpecies, pageSize, cursor),
    [preferredSpecies],
    !roleLoading
  );
  const labels = petLabels(preferredSpecies);

  const visibleReports = reports.filter((r) => r.status !== RECORD_STATUS.ARCHIVED && r.status !== RECORD_STATUS.RESOLVED);

  return (
    <div className="p-4">
      <BackLink to="/">חזרה לעמוד הראשי</BackLink>
      <h1 className="mb-4 text-xl font-bold text-slate-800">
        {labels.allFoundReportsTitle}
        {visibleReports.length > 0 && <span className="text-sm font-normal text-slate-400"> ({visibleReports.length})</span>}
      </h1>

      {loading && <p className="text-slate-500">טוען...</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">טעינת הרשימה נכשלה: {error}</p>}
      {!loading && visibleReports.length === 0 && !error && <p className="text-sm text-slate-400">אין דיווחים עדיין.</p>}

      <ul className="space-y-2">
        {visibleReports.map((r) => (
          <FoundReportRow key={r.id} report={r} statusLabels={FOUND_REPORT_STATUS_LABELS} />
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
