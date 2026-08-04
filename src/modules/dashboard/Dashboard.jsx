import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { APP_VERSION } from '../../version.js';
import { RECORD_STATUS, LOST_CASE_STATUS_LABELS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { listFoundReports, listLostCases } from './dashboardApi.js';

const STATUS_BADGE_COLORS = {
  [RECORD_STATUS.SUSPENDED]: 'bg-amber-100 text-amber-800',
  [RECORD_STATUS.ARCHIVED]: 'bg-slate-200 text-slate-600',
  [RECORD_STATUS.RESOLVED]: 'bg-blue-100 text-blue-800',
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [lostCases, setLostCases] = useState([]);
  const [foundReports, setFoundReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    Promise.all([listLostCases(), listFoundReports()]).then(([cases, reports]) => {
      setLostCases(cases);
      setFoundReports(reports);
      setLoading(false);
    });
  }, []);

  const visibleLostCases = useMemo(
    () => lostCases.filter((c) => showArchived || c.status !== RECORD_STATUS.ARCHIVED),
    [lostCases, showArchived]
  );
  const visibleFoundReports = useMemo(
    () => foundReports.filter((r) => showArchived || r.status !== RECORD_STATUS.ARCHIVED),
    [foundReports, showArchived]
  );
  const archivedCount =
    lostCases.filter((c) => c.status === RECORD_STATUS.ARCHIVED).length +
    foundReports.filter((r) => r.status === RECORD_STATUS.ARCHIVED).length;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            איתור חיות מחמד <span className="text-xs font-normal text-slate-400">{APP_VERSION}</span>
          </h1>
          <p className="text-sm text-slate-500">{user?.displayName}</p>
        </div>
        <button onClick={signOut} className="text-sm text-slate-500 underline">
          התנתקות
        </button>
      </header>

      <div className="mb-6 flex gap-3">
        <Link to="/lost/new" className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-center font-medium text-white">
          חתול שלי אבד
        </Link>
        <Link to="/found/new" className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-center font-medium text-white">
          ראיתי/מצאתי חתול
        </Link>
      </div>

      {loading && <p className="text-slate-500">טוען...</p>}

      {archivedCount > 0 && (
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="mb-4 text-xs text-slate-400 underline"
        >
          {showArchived ? 'הסתרת רשומות בארכיון' : `הצגת ${archivedCount} רשומות בארכיון`}
        </button>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">תיקי חיפוש</h2>
        {visibleLostCases.length === 0 && !loading && <p className="text-sm text-slate-400">אין תיקים פתוחים עדיין.</p>}
        <ul className="space-y-2">
          {visibleLostCases.map((c) => (
            <li key={c.id}>
              <Link
                to={`/lost/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{c.name || 'חתול ללא שם'}</span>
                  <StatusBadge status={c.status} labels={LOST_CASE_STATUS_LABELS} />
                </span>
                {c.matchCount > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                    {c.matchCount} התאמות אפשריות
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">{c.lastSeenLocation}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">דיווחים על חתולים שנראו/נמצאו</h2>
        {visibleFoundReports.length === 0 && !loading && <p className="text-sm text-slate-400">אין דיווחים עדיין.</p>}
        <ul className="space-y-2">
          {visibleFoundReports.map((r) => (
            <li key={r.id}>
              <Link to={`/found/${r.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{r.colorDescription || 'חתול'}</span>
                    <StatusBadge status={r.status} labels={FOUND_REPORT_STATUS_LABELS} />
                  </span>
                  <span className="text-xs text-slate-400">{r.location}</span>
                </div>
                {r.sourceGroupName && <p className="mt-1 text-xs text-slate-400">מקור: {r.sourceGroupName}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatusBadge({ status, labels }) {
  if (!status || status === RECORD_STATUS.ACTIVE) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {labels[status] || status}
    </span>
  );
}
