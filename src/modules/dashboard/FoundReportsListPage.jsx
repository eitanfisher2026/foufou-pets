import { useEffect, useState } from 'react';
import { RECORD_STATUS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { listFoundReports } from './dashboardApi.js';
import { FoundReportRow } from './RecordRows.jsx';
import BackLink from '../shared/BackLink.jsx';

/**
 * The full found-reports list, on its own page instead of the dashboard's
 * default load - most people only ever need their own submission, and
 * matching already queries found reports independently, so this is purely
 * an on-demand "browse everything" view (mainly useful while testing).
 * Archived/resolved reports live in the archive page instead, not here.
 */
export default function FoundReportsListPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listFoundReports().then((data) => {
      setReports(data);
      setLoading(false);
    });
  }, []);

  const visibleReports = reports.filter(
    (r) => r.status !== RECORD_STATUS.ARCHIVED && r.status !== RECORD_STATUS.RESOLVED
  );

  return (
    <div className="p-4">
      <BackLink to="/">חזרה לעמוד הראשי</BackLink>
      <h1 className="mb-4 text-xl font-bold text-slate-800">
        דיווחים על חתולים שנראו/נמצאו
        {visibleReports.length > 0 && <span className="text-sm font-normal text-slate-400"> ({visibleReports.length})</span>}
      </h1>

      {loading && <p className="text-slate-500">טוען...</p>}
      {!loading && visibleReports.length === 0 && <p className="text-sm text-slate-400">אין דיווחים עדיין.</p>}

      <ul className="space-y-2">
        {visibleReports.map((r) => (
          <FoundReportRow key={r.id} report={r} statusLabels={FOUND_REPORT_STATUS_LABELS} />
        ))}
      </ul>
    </div>
  );
}
