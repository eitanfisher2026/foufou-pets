import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RECORD_STATUS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { listLostCases, listFoundReports } from './dashboardApi.js';
import { FoundReportRow } from './RecordRows.jsx';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { formatDate } from '../shared/formatDate.js';
import BackLink from '../shared/BackLink.jsx';

const ARCHIVE_STATUSES = new Set([RECORD_STATUS.ARCHIVED, RECORD_STATUS.RESOLVED]);

/**
 * Closed lost cases (archived or resolved - both share the same closure
 * fields, see lostFieldMapping.js) split into two lists by returnedToOwner
 * rather than by status: "הוחזרו לבעלים" is specifically the reunion
 * outcome this exists to recognize, "בארכיון" is everything else closed
 * without a confirmed return. Same four columns in both, since it's the
 * same underlying record either way.
 */
function ClosureRow({ lostCase: c }) {
  return (
    <li>
      <Link to={`/lost/${c.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{displayLostCaseName(c)}</span>
          {c.closureDate && <span className="shrink-0 text-xs text-slate-400">{formatDate(c.closureDate)}</span>}
        </div>
        {c.closedBy && <p className="mt-1 text-xs text-slate-500">ע״י: {c.closedBy}</p>}
        {c.closingComment && <p className="mt-1 truncate text-xs text-slate-400">{c.closingComment}</p>}
      </Link>
    </li>
  );
}

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

  useEffect(() => {
    Promise.all([listLostCases(), listFoundReports()]).then(([cases, reports]) => {
      setLostCases(cases.filter((c) => ARCHIVE_STATUSES.has(c.status)));
      setFoundReports(reports.filter((r) => ARCHIVE_STATUSES.has(r.status)));
      setLoading(false);
    });
  }, []);

  const returnedCases = lostCases.filter((c) => c.returnedToOwner);
  const archivedCases = lostCases.filter((c) => !c.returnedToOwner);

  return (
    <div className="p-4">
      <BackLink to="/">חזרה לעמוד הראשי</BackLink>
      <h1 className="mb-1 text-xl font-bold text-slate-800">ארכיון</h1>
      <p className="mb-6 text-sm text-slate-500">תיקים ודיווחים שנסגרו או שהחתול בהם הוחזר לבעליו.</p>

      {loading && <p className="text-slate-500">טוען...</p>}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          הוחזרו לבעלים
          {returnedCases.length > 0 && <span className="text-sm font-normal text-slate-400"> ({returnedCases.length})</span>}
        </h2>
        {!loading && returnedCases.length === 0 && <p className="text-sm text-slate-400">אין עדיין חתולים שהוחזרו לבעליהם.</p>}
        <ul className="space-y-2">
          {returnedCases.map((c) => (
            <ClosureRow key={c.id} lostCase={c} />
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          בארכיון
          {archivedCases.length > 0 && <span className="text-sm font-normal text-slate-400"> ({archivedCases.length})</span>}
        </h2>
        {!loading && archivedCases.length === 0 && <p className="text-sm text-slate-400">אין תיקים בארכיון.</p>}
        <ul className="space-y-2">
          {archivedCases.map((c) => (
            <ClosureRow key={c.id} lostCase={c} />
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
