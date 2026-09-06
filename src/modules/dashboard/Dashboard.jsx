import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { RECORD_STATUS, LOST_CASE_STATUS_LABELS, FOUND_REPORT_STATUS_LABELS } from '../shared/collections.js';
import { petLabels } from '../shared/petLabels.js';
import SpeciesToggle from '../shared/SpeciesToggle.jsx';
import { listLostCases, listFoundReports, listLostCasesPage, countFoundReports, countLostCases } from './dashboardApi.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { LostCaseRow, FoundReportRow } from './RecordRows.jsx';
import ProfileMenu from '../shared/ProfileMenu.jsx';
import AppFooter from '../shared/AppFooter.jsx';
import HelpDialog from '../shared/HelpDialog.jsx';
import OnboardingDialog from '../shared/OnboardingDialog.jsx';
import SearchDialog from './SearchDialog.jsx';
import { matchesSearch } from './recordSearch.js';
import { usePaginatedList } from '../shared/usePaginatedList.js';

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
  // Paginated - the default open-cases view only ever needs what's on
  // screen, not the whole species' worth up front (see usePaginatedList).
  // Search is the exception: it needs the complete list to search
  // correctly, so it fetches separately in full (lostCasesForSearch below),
  // same pattern already used for a found-side search.
  const { items: lostCases, loading, hasMore, loadingMore, error: loadError, loadMore } = usePaginatedList(
    (pageSize, cursor) => listLostCasesPage(preferredSpecies, pageSize, cursor),
    [preferredSpecies],
    !roleLoading
  );
  const [confidenceColors, setConfidenceColors] = useState(undefined);
  const [foundCount, setFoundCount] = useState(null);
  // Total lost-case count for the species, just to show pagination
  // progress ("20/64" etc.) next to the load-more button - a cheap
  // count-only query, same idea as foundCount below.
  const [totalLostCount, setTotalLostCount] = useState(null);
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
  // Set when arriving here from the match-analysis page after running out
  // of pending candidates to auto-advance through (see
  // MatchAnalysisPage.jsx) - names the lost case whose row to scroll to
  // and highlight below, and the species to switch to first if that case
  // isn't the one currently shown. Excluded from the searchCriteria
  // restore below - it isn't a search filter, and search's own field-based
  // matching would treat these two keys as (nonsensical) criteria to match
  // records against otherwise.
  const focusCaseId = searchParams.get('focus');
  const focusSpecies = searchParams.get('focusSpecies');
  const [searchCriteria, setSearchCriteriaState] = useState(() => {
    const fromUrl = Object.fromEntries(searchParams.entries());
    delete fromUrl.focus;
    delete fromUrl.focusSpecies;
    return Object.keys(fromUrl).length > 0 ? fromUrl : null;
  });
  const [foundReportsForSearch, setFoundReportsForSearch] = useState([]);
  const [loadingFoundSearch, setLoadingFoundSearch] = useState(false);
  // Same on-demand full fetch as foundReportsForSearch, now needed on the
  // lost side too since lostCases above is only ever a paginated slice -
  // a search has to run against everything, not just whatever page
  // happened to be loaded already.
  const [lostCasesForSearch, setLostCasesForSearch] = useState([]);
  const [loadingLostSearch, setLoadingLostSearch] = useState(false);
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

  // In practice this only ever matters if the review that sent someone back
  // here (see MatchAnalysisPage.jsx) happened to start from the other
  // species' tab than the one currently selected - matches are always
  // same-species, so this is rare, but switching (and saving, same as
  // using the toggle by hand) avoids silently landing on a case that isn't
  // even in the list this page is about to render.
  useEffect(() => {
    if (roleLoading || !focusSpecies || focusSpecies === preferredSpecies) return;
    setPreferredSpecies(focusSpecies);
  }, [roleLoading, focusSpecies, preferredSpecies]);

  // The case to scroll to and highlight might not be on the first loaded
  // page yet (see usePaginatedList) - keep paging in further batches until
  // it turns up or the list genuinely runs out. Skipped during an active
  // search, where this list isn't even what's rendered.
  useEffect(() => {
    if (!focusCaseId || hasActiveSearch || loading || loadingMore || !hasMore) return;
    if (lostCases.some((c) => c.id === focusCaseId)) return;
    loadMore();
  }, [focusCaseId, hasActiveSearch, lostCases, loading, loadingMore, hasMore]);

  useEffect(() => {
    if (!focusCaseId || hasActiveSearch) return;
    const el = document.getElementById(`case-${focusCaseId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusCaseId, hasActiveSearch, lostCases]);

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
    setLostCasesForSearch([]);
  }, [preferredSpecies]);

  // Just a count query (no documents fetched) - cheap enough to run
  // eagerly, unlike the full list this links to. Same roleLoading gate as
  // the list above, and for the same reason.
  useEffect(() => {
    if (roleLoading) return;
    setFoundCount(null);
    countFoundReports(preferredSpecies).then(setFoundCount);
  }, [preferredSpecies, roleLoading]);

  useEffect(() => {
    if (roleLoading) return;
    setTotalLostCount(null);
    countLostCases(preferredSpecies).then(setTotalLostCount);
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
    if (searchCriteria?.recordType === 'lost' || searchCriteria?.recordType === 'both') {
      setLoadingLostSearch(true);
      listLostCases(preferredSpecies)
        .then((cases) => setLostCasesForSearch(cases.filter((c) => c.status !== RECORD_STATUS.ARCHIVED && c.status !== RECORD_STATUS.RESOLVED)))
        .finally(() => setLoadingLostSearch(false));
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
    if (criteria.recordType === 'lost' || criteria.recordType === 'both') {
      setLoadingLostSearch(true);
      try {
        const cases = await listLostCases(preferredSpecies);
        setLostCasesForSearch(cases.filter((c) => c.status !== RECORD_STATUS.ARCHIVED && c.status !== RECORD_STATUS.RESOLVED));
      } finally {
        setLoadingLostSearch(false);
      }
    }
  }

  function handleClearSearch() {
    applySearchCriteria(null);
    setFoundReportsForSearch([]);
    setLostCasesForSearch([]);
  }

  // Archived and resolved cases move to their own archive view (see
  // ArchivePage.jsx) instead of a same-page toggle - a resolved case
  // (already found) doesn't need attention any more than an archived one
  // does, so it doesn't belong cluttering the default working list either.
  // Species itself is no longer filtered here - listLostCases(species)
  // above only ever returns the current species to begin with.
  const openLostCases = lostCases.filter((c) => c.status !== RECORD_STATUS.ARCHIVED && c.status !== RECORD_STATUS.RESOLVED);
  const lostResults =
    activeRecordType === 'found'
      ? []
      : hasActiveSearch
      ? lostCasesForSearch.filter((c) => matchesSearch(c, activeFields))
      : openLostCases;
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
          {hasActiveSearch
            ? resultCount > 0 && <span className="text-sm font-normal text-slate-400">({resultCount})</span>
            : lostCases.length > 0 && (
                <span className="text-sm font-normal text-slate-400">
                  ({lostCases.length}
                  {totalLostCount != null && totalLostCount !== lostCases.length ? `/${totalLostCount}` : ''})
                </span>
              )}
        </h2>
        {hasActiveSearch && (
          <button type="button" onClick={handleClearSearch} className="mb-3 text-xs text-slate-500 underline">
            ניקוי חיפוש וחזרה לכל {labels.openCasesSection}
          </button>
        )}
        {loading && <p className="text-slate-500">טוען...</p>}
        {loadError && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">טעינת הרשימה נכשלה: {loadError}</p>}
        {loadingLostSearch && <p className="text-sm text-slate-400">מחפשים בכל התיקים...</p>}
        {loadingFoundSearch && <p className="text-sm text-slate-400">טוענים גם את הדיווחים שנמצאו...</p>}
        {!loading && !loadingFoundSearch && !loadingLostSearch && resultCount === 0 && (
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
              highlighted={c.id === focusCaseId}
            />
          ))}
          {foundResults.map((r) => (
            <FoundReportRow key={r.id} report={r} statusLabels={FOUND_REPORT_STATUS_LABELS} showTypeBadge={activeRecordType === 'both'} />
          ))}
        </ul>
        {!hasActiveSearch && !loading && hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-3 w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            {loadingMore ? 'טוען...' : 'טען עוד'}
          </button>
        )}
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
