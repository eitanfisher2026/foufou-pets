import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { APP_VERSION } from '../../version.js';
import { RECORD_STATUS, LOST_CASE_STATUS_LABELS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { listFoundReports, listLostCases } from './dashboardApi.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';

const STATUS_BADGE_COLORS = {
  [RECORD_STATUS.SUSPENDED]: 'bg-amber-100 text-amber-800',
  [RECORD_STATUS.ARCHIVED]: 'bg-slate-200 text-slate-600',
  [RECORD_STATUS.RESOLVED]: 'bg-blue-100 text-blue-800',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [lostCases, setLostCases] = useState([]);
  const [foundReports, setFoundReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [confidenceColors, setConfidenceColors] = useState(undefined);

  useEffect(() => {
    Promise.all([listLostCases(), listFoundReports()]).then(([cases, reports]) => {
      setLostCases(cases);
      setFoundReports(reports);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    getMatchConfig().then((c) => setConfidenceColors(c.confidenceColors));
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
    <div className="p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800">
            איתור חיות מחמד <span className="text-xs font-normal text-slate-400">{APP_VERSION}</span>
          </h1>
          <p className="truncate text-sm text-slate-500">{user?.displayName}</p>
        </div>
        <Link to="/settings" className="shrink-0 text-sm text-slate-500 underline">
          הגדרות ⚙
        </Link>
      </header>

      <div className="mb-3 flex gap-3">
        <Link to="/lost/new" className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-center font-medium text-white">
          חתול שלי אבד
        </Link>
        <Link to="/found/new" className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-center font-medium text-white">
          ראיתי/מצאתי חתול
        </Link>
      </div>

      <Link
        to="/report/new"
        className="mb-6 block rounded-xl border border-dashed border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-600"
      >
        או: הוספה חכמה - נזהה אוטומטית אם זה אבד או נמצא
      </Link>

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
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          תיקי חיפוש{' '}
          {visibleLostCases.length > 0 && (
            <span className="text-sm font-normal text-slate-400">({visibleLostCases.length})</span>
          )}
        </h2>
        {visibleLostCases.length === 0 && !loading && <p className="text-sm text-slate-400">אין תיקים פתוחים עדיין.</p>}
        <ul className="space-y-2">
          {visibleLostCases.map((c) => (
            <li key={c.id}>
              <Link
                to={`/lost/${c.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{displayLostCaseName(c)}</span>
                  <StatusBadge status={c.status} labels={LOST_CASE_STATUS_LABELS} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-400">{c.neighborhood}</span>
                  {c.matchCount > 0 && (
                    <MatchSummaryRow
                      matchCount={c.matchCount}
                      newMatchCount={c.newMatchCount}
                      topMatchScore={c.topMatchScore}
                      confidenceColors={confidenceColors}
                    />
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          דיווחים על חתולים שנראו/נמצאו{' '}
          {visibleFoundReports.length > 0 && (
            <span className="text-sm font-normal text-slate-400">({visibleFoundReports.length})</span>
          )}
        </h2>
        {visibleFoundReports.length === 0 && !loading && <p className="text-sm text-slate-400">אין דיווחים עדיין.</p>}
        <ul className="space-y-2">
          {visibleFoundReports.map((r) => (
            <li key={r.id}>
              <Link to={`/found/${r.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{r.title || 'חתול'}</span>
                  <StatusBadge status={r.status} labels={FOUND_REPORT_STATUS_LABELS} />
                </div>
                <p className="mt-1 truncate text-xs text-slate-400">{r.neighborhood}</p>
                {r.sourceGroupName && <p className="mt-1 text-xs text-slate-400">מקור: {r.sourceGroupName}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// The total candidate count (matchCount) is shown once, in the section
// header - repeating it on every single row added nothing. Each row just
// needs its own best score and how many of its matches are still unseen.
// The reviewed/new counts are plain text (not a colored pill) - only the
// confidence level itself is a color-coded badge, kept separate so the two
// kinds of information don't visually blur into one thing.
function MatchSummaryRow({ matchCount, newMatchCount, topMatchScore, confidenceColors }) {
  const hasNew = newMatchCount > 0;
  const reviewedCount = matchCount - newMatchCount;
  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-xs text-black">
        {hasNew && `${newMatchCount} חדש, `}
        {reviewedCount} נבדקו
      </span>
      <ConfidenceBadge score={topMatchScore} confidenceColors={confidenceColors} />
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
