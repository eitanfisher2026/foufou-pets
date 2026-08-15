import { RECORD_STATUS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { petLabels } from '../shared/petLabels.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listFoundReports } from './dashboardApi.js';
import { FoundReportRow } from './RecordRows.jsx';
import BackLink from '../shared/BackLink.jsx';
import ProgressBar from '../shared/ProgressBar.jsx';
import { useLoadWithProgress } from '../shared/useLoadWithProgress.js';

/**
 * The full found-reports list, on its own page instead of the dashboard's
 * default load - most people only ever need their own submission, and
 * matching already queries found reports independently, so this is purely
 * an on-demand "browse everything" view (mainly useful while testing).
 * Archived/resolved reports live in the archive page instead, not here.
 */
export default function FoundReportsListPage() {
  const { preferredSpecies, roleLoading } = useAuth();
  // Same server-side species filter and roleLoading gate as the dashboard's
  // lost-case list (see Dashboard.jsx/dashboardApi.js) - only the current
  // species is ever fetched, re-fetched on toggle switch.
  const { items: reports, loading, progress } = useLoadWithProgress(
    () => listFoundReports(preferredSpecies),
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

      {progress && <ProgressBar current={progress.current} total={progress.total} />}
      {loading && !progress && <p className="text-slate-500">טוען...</p>}
      {!loading && visibleReports.length === 0 && <p className="text-sm text-slate-400">אין דיווחים עדיין.</p>}

      <ul className="space-y-2">
        {visibleReports.map((r) => (
          <FoundReportRow key={r.id} report={r} statusLabels={FOUND_REPORT_STATUS_LABELS} />
        ))}
      </ul>
    </div>
  );
}
