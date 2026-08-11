import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { APP_VERSION } from '../../version.js';
import { RECORD_STATUS, LOST_CASE_STATUS_LABELS } from '../shared/collections.js';
import { listLostCases } from './dashboardApi.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { LostCaseRow } from './RecordRows.jsx';

// A found report doesn't need its own eagerly-loaded browsing list on every
// dashboard visit - matching already runs its own independent query against
// found reports (see matchingApi.js), so this list was never actually load-
// bearing for the app's core flow, just a nice-to-have "browse everything"
// view. Loading only lost cases by default cuts the dashboard's default
// read in half; "כל הדיווחים על חתולים שנמצאו" is one tap away instead.
export default function Dashboard() {
  const { user } = useAuth();
  const [lostCases, setLostCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confidenceColors, setConfidenceColors] = useState(undefined);

  useEffect(() => {
    listLostCases().then((cases) => {
      setLostCases(cases);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    getMatchConfig().then((c) => setConfidenceColors(c.confidenceColors));
  }, []);

  // Archived and resolved cases move to their own archive view (see
  // ArchivePage.jsx) instead of a same-page toggle - a resolved case (cat
  // already found) doesn't need attention any more than an archived one
  // does, so it doesn't belong cluttering the default working list either.
  const visibleLostCases = useMemo(
    () => lostCases.filter((c) => c.status !== RECORD_STATUS.ARCHIVED && c.status !== RECORD_STATUS.RESOLVED),
    [lostCases]
  );

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
        className="mb-6 block rounded-xl bg-gradient-to-l from-red-600 to-emerald-600 px-4 py-2 text-center text-sm font-medium text-white shadow-sm"
      >
        או: הוספה חכמה - נזהה אוטומטית אם זה אבד או נמצא
      </Link>

      {loading && <p className="text-slate-500">טוען...</p>}

      <div className="mb-4 flex flex-wrap gap-4">
        <Link to="/found" className="text-xs text-slate-500 underline">
          צפייה בכל הדיווחים על חתולים שנמצאו
        </Link>
        <Link to="/archive" className="text-xs text-slate-500 underline">
          ארכיון (סגורים ומוחזרים לבעלים)
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          תיקי חיפוש{' '}
          {visibleLostCases.length > 0 && (
            <span className="text-sm font-normal text-slate-400">({visibleLostCases.length})</span>
          )}
        </h2>
        {visibleLostCases.length === 0 && !loading && <p className="text-sm text-slate-400">אין תיקים פתוחים עדיין.</p>}
        <ul className="space-y-2">
          {visibleLostCases.map((c) => (
            <LostCaseRow key={c.id} lostCase={c} statusLabels={LOST_CASE_STATUS_LABELS} confidenceColors={confidenceColors} />
          ))}
        </ul>
      </section>
    </div>
  );
}
