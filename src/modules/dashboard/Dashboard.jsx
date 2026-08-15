import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { RECORD_STATUS, LOST_CASE_STATUS_LABELS, SPECIES } from '../shared/collections.js';
import { petLabels } from '../shared/petLabels.js';
import SpeciesToggle from '../shared/SpeciesToggle.jsx';
import { listLostCases, countFoundReports } from './dashboardApi.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { LostCaseRow } from './RecordRows.jsx';
import ProfileMenu from '../shared/ProfileMenu.jsx';
import AppFooter from '../shared/AppFooter.jsx';
import ProgressBar from '../shared/ProgressBar.jsx';
import HelpDialog from '../shared/HelpDialog.jsx';
import { useLoadWithProgress } from '../shared/useLoadWithProgress.js';

// A found report doesn't need its own eagerly-loaded browsing list on every
// dashboard visit - matching already runs its own independent query against
// found reports (see matchingApi.js), so this list was never actually load-
// bearing for the app's core flow, just a nice-to-have "browse everything"
// view. Loading only lost cases by default cuts the dashboard's default
// read in half; "כל הדיווחים על חיות שנמצאו" is one tap away instead.
export default function Dashboard() {
  const { preferredSpecies, setPreferredSpecies } = useAuth();
  const { items: lostCases, loading, progress } = useLoadWithProgress(listLostCases, []);
  const [confidenceColors, setConfidenceColors] = useState(undefined);
  const [foundCount, setFoundCount] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const labels = petLabels(preferredSpecies);

  useEffect(() => {
    getMatchConfig().then((c) => setConfidenceColors(c.confidenceColors));
  }, []);

  // Just a count query (no documents fetched) - cheap enough to run
  // eagerly, unlike the full list this links to.
  useEffect(() => {
    setFoundCount(null);
    countFoundReports(preferredSpecies).then(setFoundCount);
  }, [preferredSpecies]);

  // Archived and resolved cases move to their own archive view (see
  // ArchivePage.jsx) instead of a same-page toggle - a resolved case
  // (already found) doesn't need attention any more than an archived one
  // does, so it doesn't belong cluttering the default working list either.
  // Species filtering matches the toggle above: this person is working in
  // one species at a time (see petLabels.js/SpeciesToggle.jsx), so a dog
  // case shouldn't clutter the list while working the cat queue, and vice
  // versa. A record from before species tracking existed defaults to cat.
  const visibleLostCases = useMemo(
    () =>
      lostCases.filter(
        (c) =>
          c.status !== RECORD_STATUS.ARCHIVED &&
          c.status !== RECORD_STATUS.RESOLVED &&
          (c.species || SPECIES.CAT) === preferredSpecies
      ),
    [lostCases, preferredSpecies]
  );

  return (
    <div className="p-4">
      <header className="mb-6 grid grid-cols-3 items-center gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="עזרה"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500"
          >
            ℹ️
          </button>
        </div>
        <h1 className="truncate text-center text-xl font-bold text-slate-800">חיות אבודות</h1>
        <div className="flex justify-end">
          <ProfileMenu />
        </div>
      </header>

      <SpeciesToggle value={preferredSpecies} onChange={setPreferredSpecies} />

      <div className="mb-3 flex gap-3">
        <Link
          to="/lost/new"
          className="flex h-12 flex-1 items-center justify-center whitespace-nowrap rounded-xl bg-red-600 px-3 text-center text-xs font-medium text-white"
        >
          {labels.lostButton}
        </Link>
        <Link
          to="/found/new"
          className="flex h-12 flex-1 items-center justify-center whitespace-nowrap rounded-xl bg-emerald-600 px-3 text-center text-xs font-medium text-white"
        >
          {labels.foundButton}
        </Link>
      </div>

      <Link
        to="/report/new"
        className="mb-6 block rounded-xl bg-gradient-to-l from-red-600 to-emerald-600 px-4 py-2 text-center text-sm font-medium text-white shadow-sm"
      >
        או: הוספה חכמה - נזהה אוטומטית אם זה אבד או נמצא
      </Link>

      {progress && <ProgressBar current={progress.current} total={progress.total} />}
      {loading && !progress && <p className="text-slate-500">טוען...</p>}

      <div className="mb-4 flex items-center justify-between gap-4">
        <Link to="/found" className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
          {labels.allFoundReportsLink}
          {foundCount != null && foundCount > 0 && <span className="text-slate-400"> ({foundCount})</span>}
        </Link>
        <Link to="/archive" className="text-xs text-slate-500 underline">
          ארכיון
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">
          {labels.openCasesSection}{' '}
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

      <AppFooter />

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  );
}
