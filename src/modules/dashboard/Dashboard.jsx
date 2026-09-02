import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { RECORD_STATUS, LOST_CASE_STATUS_LABELS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { petLabels } from '../shared/petLabels.js';
import SpeciesToggle from '../shared/SpeciesToggle.jsx';
import { listLostCases, listFoundReports, countFoundReports } from './dashboardApi.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { LostCaseRow, FoundReportRow } from './RecordRows.jsx';
import ProfileMenu from '../shared/ProfileMenu.jsx';
import AppFooter from '../shared/AppFooter.jsx';
import ProgressBar from '../shared/ProgressBar.jsx';
import HelpDialog from '../shared/HelpDialog.jsx';
import OnboardingDialog from '../shared/OnboardingDialog.jsx';
import SearchDialog from './SearchDialog.jsx';
import { matchesSearch } from './recordSearch.js';
import { useLoadWithProgress } from '../shared/useLoadWithProgress.js';

// A found report doesn't need its own eagerly-loaded browsing list on every
// dashboard visit - matching already runs its own independent query against
// found reports (see matchingApi.js), so this list was never actually load-
// bearing for the app's core flow, just a nice-to-have "browse everything"
// view. Loading only lost cases by default cuts the dashboard's default
// read in half; "כל הדיווחים על חיות שנמצאו" is one tap away instead. Found
// reports only ever get fetched here on demand, when a search explicitly
// asks to include them (see handleSearch below).
export default function Dashboard() {
  const { preferredSpecies, setPreferredSpecies, roleLoading, hasSeenOnboarding, dismissOnboarding } = useAuth();
  // Firestore does the species filtering now (see dashboardApi.js) rather
  // than fetching both species and filtering client-side - re-runs
  // whenever the toggle switches, so switching species re-fetches just
  // that species instead of re-filtering an already-fetched mixed list.
  // Held off (`enabled: !roleLoading`) until the signed-in user's saved
  // species preference has actually loaded - preferredSpecies starts at
  // its default ('cat') for a moment on every load, and fetching against
  // that default only to immediately re-fetch once the real value arrives
  // is exactly the double round-trip that made this feel slow to load.
  const { items: lostCases, loading, progress } = useLoadWithProgress(
    () => listLostCases(preferredSpecies),
    [preferredSpecies],
    !roleLoading
  );
  const [confidenceColors, setConfidenceColors] = useState(undefined);
  const [foundCount, setFoundCount] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  // A dialog left open when the app is backgrounded (switching apps,
  // locking the phone) can resurface as a brief stale frame the instant
  // the OS resumes the tab, before React's real current state repaints
  // over it a moment later - reads as "this opens on its own and vanishes
  // after a second" even though nothing in this component's own logic
  // opened it. Forcing every dismissible dialog closed the moment the app
  // becomes visible again removes that stale state to repaint from,
  // regardless of how it was left. Deliberately not applied to
  // showOnboarding below - a genuinely new user reading it who briefly
  // switches apps shouldn't lose their place, since there's no way for
  // them to reopen it themselves.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') setShowHelp(false);
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
  // Gated on !roleLoading too, not just hasSeenOnboarding, since
  // hasSeenOnboarding defaults to true until the live profile subscription
  // actually resolves (see AuthProvider.jsx) - checking only the flag would
  // let this open, then immediately close, for a genuinely new user on
  // every load.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!roleLoading && !hasSeenOnboarding) setShowOnboarding(true);
  }, [roleLoading, hasSeenOnboarding]);
  const [showSearch, setShowSearch] = useState(false);
  // Search criteria lives in the URL (via useSearchParams), not just
  // component state - opening a search result navigates away to a whole
  // different route, which unmounts this component and wipes any plain
  // state. Without the URL round-trip, pressing "back" from that result
  // landed on a blank, freshly-mounted dashboard with no memory a search
  // had even happened, regardless of which back button was used - it
  // wasn't a navigation bug, the search results just weren't a real place
  // to return to. null = no search applied yet; otherwise
  // { recordType, ...fields } matching what SearchDialog produces. Found
  // reports for a 'found'/'both' search live in their own state below,
  // fetched only when actually needed (including once, on mount, if
  // restoring a 'found'/'both' search from the URL).
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchCriteria, setSearchCriteriaState] = useState(() => {
    const fromUrl = Object.fromEntries(searchParams.entries());
    return Object.keys(fromUrl).length > 0 ? fromUrl : null;
  });
  const [foundReportsForSearch, setFoundReportsForSearch] = useState([]);
  const [loadingFoundSearch, setLoadingFoundSearch] = useState(false);
  const labels = petLabels(preferredSpecies);

  const { recordType: activeRecordType = 'lost', ...activeFields } = searchCriteria || {};
  // Picking "found" or "both" is itself a meaningful search (it changes
  // what's shown, even with no field filled in) - only "lost" with nothing
  // filled in is indistinguishable from the default view, so that alone
  // doesn't count as an active search worth showing a "clear" link for.
  const hasActiveSearch = searchCriteria !== null && (activeRecordType !== 'lost' || Object.values(activeFields).some((v) => v));

  function applySearchCriteria(criteria) {
    setSearchCriteriaState(criteria);
    setSearchParams(criteria || {}, { replace: true });
  }

  useEffect(() => {
    getMatchConfig().then((c) => setConfidenceColors(c.confidenceColors));
  }, []);

  // Some search fields are species-specific (e.g. "תבנית פרווה" only
  // applies to cats) - clearing on toggle switch avoids a stale filter
  // silently carrying over to a species it was never meant for. Compares
  // against the last-seen species (initialized to the current one, not a
  // boolean "have I run yet" flag) rather than just skipping the first
  // run - a plain skip-first-run flag breaks under StrictMode, which
  // double-invokes an effect on mount in development: the first
  // invocation flips the flag, so the second one - still logically part
  // of the same mount, not a real dependency change - runs the "real"
  // body anyway and wipes out a search just restored from the URL before
  // it's ever seen. Comparing values instead of counting invocations
  // survives being called an extra time with the same value.
  const prevSpeciesRef = useRef(preferredSpecies);
  useEffect(() => {
    if (prevSpeciesRef.current === preferredSpecies) return;
    prevSpeciesRef.current = preferredSpecies;
    applySearchCriteria(null);
    setFoundReportsForSearch([]);
  }, [preferredSpecies]);

  // Just a count query (no documents fetched) - cheap enough to run
  // eagerly, unlike the full list this links to. Same roleLoading gate as
  // the list above, and for the same reason.
  useEffect(() => {
    if (roleLoading) return;
    setFoundCount(null);
    countFoundReports(preferredSpecies).then(setFoundCount);
  }, [preferredSpecies, roleLoading]);

  // Restores the found-reports fetch a 'found'/'both' search from the URL
  // needs - handleSearch below already does this for a search performed in
  // this same session, but a search restored from the URL on load never
  // went through handleSearch at all.
  useEffect(() => {
    if (roleLoading) return;
    if (searchCriteria?.recordType === 'found' || searchCriteria?.recordType === 'both') {
      setLoadingFoundSearch(true);
      listFoundReports(preferredSpecies)
        .then((reports) =>
          setFoundReportsForSearch(reports.filter((r) => r.status !== RECORD_STATUS.ARCHIVED && r.status !== RECORD_STATUS.RESOLVED))
        )
        .finally(() => setLoadingFoundSearch(false));
    }
  }, [roleLoading]);

  async function handleSearch(criteria) {
    applySearchCriteria(criteria);
    setShowSearch(false);
    if (criteria.recordType === 'found' || criteria.recordType === 'both') {
      setLoadingFoundSearch(true);
      try {
        const reports = await listFoundReports(preferredSpecies);
        setFoundReportsForSearch(reports.filter((r) => r.status !== RECORD_STATUS.ARCHIVED && r.status !== RECORD_STATUS.RESOLVED));
      } finally {
        setLoadingFoundSearch(false);
      }
    }
  }

  function handleClearSearch() {
    applySearchCriteria(null);
    setFoundReportsForSearch([]);
  }

  // Archived and resolved cases move to their own archive view (see
  // ArchivePage.jsx) instead of a same-page toggle - a resolved case
  // (already found) doesn't need attention any more than an archived one
  // does, so it doesn't belong cluttering the default working list either.
  // Species itself is no longer filtered here - listLostCases(species)
  // above only ever returns the current species to begin with.
  const openLostCases = lostCases.filter((c) => c.status !== RECORD_STATUS.ARCHIVED && c.status !== RECORD_STATUS.RESOLVED);
  const lostResults =
    activeRecordType === 'found' ? [] : hasActiveSearch ? openLostCases.filter((c) => matchesSearch(c, activeFields)) : openLostCases;
  const foundResults =
    hasActiveSearch && activeRecordType !== 'lost' ? foundReportsForSearch.filter((r) => matchesSearch(r, activeFields)) : [];
  const resultCount = lostResults.length + foundResults.length;

  return (
    <div className="p-4">
      <header className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="whitespace-nowrap text-xl font-bold text-slate-800">איתור חיות מחמד</h1>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="עזרה"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500"
          >
            ℹ️
          </button>
        </div>
        <ProfileMenu />
      </header>

      <div className="mb-4 flex items-center justify-between gap-2">
        <SpeciesToggle value={preferredSpecies} onChange={setPreferredSpecies} className="mb-0" />
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          aria-label="חיפוש מתקדם"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${
            hasActiveSearch ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          🔍
        </button>
      </div>

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
        <h2 className="mb-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-700">
          {hasActiveSearch ? 'תוצאות חיפוש' : labels.openCasesSection}
          {resultCount > 0 && <span className="text-sm font-normal text-slate-400">({resultCount})</span>}
        </h2>
        {hasActiveSearch && (
          <button type="button" onClick={handleClearSearch} className="mb-3 text-xs text-slate-500 underline">
            ניקוי חיפוש וחזרה לכל {labels.openCasesSection}
          </button>
        )}
        {progress && <ProgressBar current={progress.current} total={progress.total} />}
        {loading && !progress && <p className="text-slate-500">טוען...</p>}
        {loadingFoundSearch && <p className="text-sm text-slate-400">טוענים גם את הדיווחים שנמצאו...</p>}
        {!loading && !loadingFoundSearch && resultCount === 0 && (
          <p className="text-sm text-slate-400">{hasActiveSearch ? 'אין תוצאות לחיפוש הזה.' : 'אין תיקים פתוחים עדיין.'}</p>
        )}
        <ul className="space-y-2">
          {lostResults.map((c) => (
            <LostCaseRow
              key={c.id}
              lostCase={c}
              statusLabels={LOST_CASE_STATUS_LABELS}
              confidenceColors={confidenceColors}
              showTypeBadge={activeRecordType === 'both'}
            />
          ))}
          {foundResults.map((r) => (
            <FoundReportRow key={r.id} report={r} statusLabels={FOUND_REPORT_STATUS_LABELS} showTypeBadge={activeRecordType === 'both'} />
          ))}
        </ul>
      </section>

      <AppFooter />

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showOnboarding && (
        <OnboardingDialog
          onClose={() => {
            setShowOnboarding(false);
            dismissOnboarding();
          }}
        />
      )}
      {showSearch && (
        <SearchDialog species={preferredSpecies} initialCriteria={searchCriteria} onSearch={handleSearch} onClose={() => setShowSearch(false)} />
      )}
    </div>
  );
}
