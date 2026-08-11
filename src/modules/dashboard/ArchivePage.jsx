import { useEffect, useState } from 'react';
import { RECORD_STATUS, LOST_CASE_STATUS_LABELS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { listLostCases, listFoundReports } from './dashboardApi.js';
import { LostCaseRow, FoundReportRow } from './RecordRows.jsx';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import BackLink from '../shared/BackLink.jsx';

const ARCHIVE_STATUSES = new Set([RECORD_STATUS.ARCHIVED, RECORD_STATUS.RESOLVED]);

/**
 * Archived and resolved records (cats closed out, or already reunited with
 * their owner) together in one place, out of the way of the working lists
 * on the dashboard - a resolved case is done just as much as an archived
 * one is, so there's no reason to keep it in the active list either.
 */
export default function ArchivePage() {
  const [lostCases, setLostCases] = useState([]);
  const [foundReports, setFoundReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confidenceColors, setConfidenceColors] = useState(undefined);

  useEffect(() => {
    Promise.all([listLostCases(), listFoundReports()]).then(([cases, reports]) => {
      setLostCases(cases.filter((c) => ARCHIVE_STATUSES.has(c.status)));
      setFoundReports(reports.filter((r) => ARCHIVE_STATUSES.has(r.status)));
      setLoading(false);
    });
    getMatchConfig().then((c) => setConfidenceColors(c.confidenceColors));
  }, []);

  return (
    <div className="p-4">
      <BackLink to="/">חזרה לעמוד הראשי</BackLink>
      <h1 className="mb-1 text-xl font-bold text-slate-800">ארכיון</h1>
      <p className="mb-6 text-sm text-slate-500">תיקים ודיווחים שנסגרו או שהחתול בהם הוחזר לבעליו.</p>

      {loading && <p className="text-slate-500">טוען...</p>}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          תיקי חיפוש{lostCases.length > 0 && <span className="text-sm font-normal text-slate-400"> ({lostCases.length})</span>}
        </h2>
        {!loading && lostCases.length === 0 && <p className="text-sm text-slate-400">אין תיקים בארכיון.</p>}
        <ul className="space-y-2">
          {lostCases.map((c) => (
            <LostCaseRow key={c.id} lostCase={c} statusLabels={LOST_CASE_STATUS_LABELS} confidenceColors={confidenceColors} />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          דיווחים על חתולים שנראו/נמצאו
          {foundReports.length > 0 && <span className="text-sm font-normal text-slate-400"> ({foundReports.length})</span>}
        </h2>
        {!loading && foundReports.length === 0 && <p className="text-sm text-slate-400">אין דיווחים בארכיון.</p>}
        <ul className="space-y-2">
          {foundReports.map((r) => (
            <FoundReportRow key={r.id} report={r} statusLabels={FOUND_REPORT_STATUS_LABELS} />
          ))}
        </ul>
      </section>
    </div>
  );
}
