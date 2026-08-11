import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RECORD_STATUS, FOUND_REPORT_STATUS_LABELS, CLOSURE_REASON, CLOSURE_REASON_LABELS } from '../shared/collections.js';
import { listLostCases, listFoundReports } from './dashboardApi.js';
import { FoundReportRow } from './RecordRows.jsx';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { formatDate } from '../shared/formatDate.js';
import BackLink from '../shared/BackLink.jsx';

const ARCHIVE_STATUSES = new Set([RECORD_STATUS.ARCHIVED, RECORD_STATUS.RESOLVED]);

function ClosureRow({ lostCase: c }) {
  return (
    <li>
      <Link to={`/lost/${c.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{displayLostCaseName(c)}</span>
          {c.closureReason && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {CLOSURE_REASON_LABELS[c.closureReason]}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-500">{c.closedBy && `ע״י: ${c.closedBy}`}</span>
          {c.closureDate && <span className="shrink-0 text-xs text-slate-400">{formatDate(c.closureDate)}</span>}
        </div>
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
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    Promise.all([listLostCases(), listFoundReports()]).then(([cases, reports]) => {
      setLostCases(cases.filter((c) => ARCHIVE_STATUSES.has(c.status)));
      setFoundReports(reports.filter((r) => ARCHIVE_STATUSES.has(r.status)));
      setLoading(false);
    });
  }, []);

  const filteredCases = useMemo(
    () =>
      lostCases.filter((c) => {
        if (statusFilter && c.closureReason !== statusFilter) return false;
        if (dateFrom && (!c.closureDate || c.closureDate < dateFrom)) return false;
        if (dateTo && (!c.closureDate || c.closureDate > dateTo)) return false;
        return true;
      }),
    [lostCases, statusFilter, dateFrom, dateTo]
  );

  return (
    <div className="p-4">
      <BackLink to="/">חזרה לעמוד הראשי</BackLink>
      <h1 className="mb-1 text-xl font-bold text-slate-800">ארכיון</h1>
      <p className="mb-6 text-sm text-slate-500">תיקים ודיווחים שנסגרו.</p>

      {loading && <p className="text-slate-500">טוען...</p>}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          תיקי חיפוש
          {filteredCases.length > 0 && <span className="text-sm font-normal text-slate-400"> ({filteredCases.length})</span>}
        </h2>

        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600">
            סטטוס
            <select className="input mt-1 block" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">הכל</option>
              {Object.values(CLOSURE_REASON).map((reason) => (
                <option key={reason} value={reason}>
                  {CLOSURE_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            מתאריך
            <input type="date" className="input mt-1 block" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600">
            עד תאריך
            <input type="date" className="input mt-1 block" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          {(statusFilter || dateFrom || dateTo) && (
            <button
              type="button"
              className="text-xs text-slate-500 underline"
              onClick={() => {
                setStatusFilter('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              נקה סינון
            </button>
          )}
        </div>

        {!loading && filteredCases.length === 0 && <p className="text-sm text-slate-400">אין תיקים תואמים.</p>}
        <ul className="space-y-2">
          {filteredCases.map((c) => (
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
