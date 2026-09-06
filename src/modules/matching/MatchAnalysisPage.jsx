import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getMatch, getMatches, getMatchesForFoundReport, checkSingleMatch, updateMatchStatus } from './matchingApi.js';
import { REPORT_STATUS } from '../shared/collections.js';
import { getLostCase } from '../lost-report/lostReportApi.js';
import { getFoundReport } from '../found-report/foundReportApi.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { displayFoundReportName } from '../found-report/foundFieldMapping.js';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';
import VisualSimilarityNote from '../shared/VisualSimilarityNote.jsx';
import BackLink from '../shared/BackLink.jsx';
import PhotoLightbox from '../shared/PhotoLightbox.jsx';
import DropdownBadge from '../shared/DropdownBadge.jsx';
import { MATCH_STATUS_LABELS, MATCH_STATUS_COLORS } from './matchStatusLabels.js';
import { getMatchConfig } from './matchConfigApi.js';

const VERDICT_STYLES = {
  match: { label: 'תואם', badge: 'bg-emerald-100 text-emerald-800' },
  partial: { label: 'התאמה חלקית', badge: 'bg-amber-100 text-amber-800' },
  mismatch: { label: 'אינו תואם', badge: 'bg-red-100 text-red-800' },
  disqualifying: { label: 'פוסל את ההתאמה', badge: 'bg-red-200 text-red-900' },
  skipped: { label: 'לא נבדק', badge: 'bg-slate-100 text-slate-600' },
  no_overlap: { label: 'אין חפיפה', badge: 'bg-slate-100 text-slate-600' },
};

function formatFieldValue(v) {
  if (v === null || v === undefined || v === '') return 'לא צוין';
  if (typeof v === 'boolean') return v ? 'כן' : 'לא';
  if (Array.isArray(v)) return v.length > 0 ? `יש (${v.length})` : 'אין';
  return String(v);
}

/**
 * Every match card only ever showed the fields that actually moved the
 * score - a field skipped for missing data was invisible, so there was no
 * way to see the full picture of what the algorithm did and didn't check.
 * This page lists every enabled parameter from breakdown (persisted at
 * check-match time, see matchingApi.js) with its own verdict, so "why did/
 * didn't this match" has a complete answer, not just the parts that
 * happened to contribute. It's also the page the visual-match alert links
 * to (see VisualMatchAlertDialog.jsx), so it leads with the two photos
 * side by side and the AI's own verdict - that's usually the entire reason
 * someone lands here, and neither used to be shown at all.
 */
export default function MatchAnalysisPage() {
  const { caseId, foundReportId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Which side this review session is actually working through: 'case'
  // (default) walks this lost case's other found-report candidates, set by
  // every entry point that starts from a lost case's own page. 'report'
  // walks this found report's other lost-case candidates instead, set by
  // FoundReportDetail.jsx's links - the URL alone (a caseId+foundReportId
  // pair either way) can't tell these apart, so the link that got you here
  // has to say which list it's stepping through.
  const dir = searchParams.get('dir') === 'report' ? 'report' : 'case';
  const [match, setMatch] = useState(null);
  const [lostCase, setLostCase] = useState(null);
  const [foundReport, setFoundReport] = useState(null);
  const [confidenceColors, setConfidenceColors] = useState(undefined);
  const [rechecking, setRechecking] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  // The full candidate list for whichever side dir names, sorted by score
  // (see getMatches/getMatchesForFoundReport) - lets marking "אין התאמה"
  // below jump straight to the next candidate instead of leaving the
  // reviewer stranded on the one they just closed out.
  const [allMatches, setAllMatches] = useState([]);

  useEffect(() => {
    Promise.all([getMatch(caseId, foundReportId), getLostCase(caseId), getFoundReport(foundReportId)]).then(
      ([m, lc, fr]) => {
        setMatch(m);
        setLostCase(lc);
        setFoundReport(fr);
      }
    );
    getMatchConfig().then((c) => setConfidenceColors(c.confidenceColors));
  }, [caseId, foundReportId]);

  useEffect(() => {
    if (dir === 'report') getMatchesForFoundReport(foundReportId).then(setAllMatches);
    else getMatches(caseId).then(setAllMatches);
  }, [dir, caseId, foundReportId]);

  // The next candidate still awaiting a first decision (status NEW, same
  // "pendingReview" definition LostCaseDetail.jsx's cards use) after this
  // one's position in the score-sorted list - not just the literal next
  // array entry, so clicking through doesn't wander back over ones already
  // triaged. Recomputed from allMatches/match rather than stored, so it
  // stays correct as statuses change (e.g. right after marking this one
  // "אין התאמה").
  const currentIndex =
    dir === 'report'
      ? allMatches.findIndex((m) => m.lostCase.id === caseId)
      : allMatches.findIndex((m) => m.foundReportId === foundReportId);
  const nextMatch =
    currentIndex >= 0 ? allMatches.slice(currentIndex + 1).find((m) => m.status === REPORT_STATUS.NEW) : null;

  // This page used to be pure read-only - seeing a stale or missing photo
  // comparison here (e.g. a match scored before the photo threshold cleared
  // it, or before this feature existed at all) meant navigating all the way
  // back to the match card just to press "סריקה חוזרת" there. Same action,
  // available from wherever "why does this look wrong" actually comes up.
  async function handleRecheck() {
    setRechecking(true);
    try {
      await checkSingleMatch(caseId, foundReportId);
      setMatch(await getMatch(caseId, foundReportId));
    } finally {
      setRechecking(false);
    }
  }

  // This page used to be read-only for status too - changing it meant
  // navigating back to the match card. Same DropdownBadge/status labels as
  // the cards (see LostCaseDetail.jsx/FoundReportDetail.jsx), plus a
  // one-click shortcut for the single most common action after reading a
  // full analysis: ruling the pair out. Landing on "אין התאמה" specifically
  // (whether via that shortcut or picked from the dropdown) also moves on
  // automatically - to the next still-pending candidate on whichever side
  // (dir) this review is walking through. Once there isn't one, this goes
  // all the way back to that side's own main list (not just one case/
  // report's own page), focused on the pet the whole review was actually
  // about - see Dashboard.jsx/FoundReportsListPage.jsx.
  async function handleStatusChange(status) {
    await updateMatchStatus(caseId, foundReportId, status);
    setMatch((prev) => ({ ...prev, status }));
    if (status === REPORT_STATUS.NOT_RELEVANT) {
      if (nextMatch) {
        if (dir === 'report') navigate(`/lost/${nextMatch.lostCase.id}/analysis/${foundReportId}?dir=report`);
        else navigate(`/lost/${caseId}/analysis/${nextMatch.foundReportId}`);
      } else if (dir === 'report') {
        navigate(`/found?focus=${foundReportId}&focusSpecies=${foundReport.species}`);
      } else {
        navigate(`/?focus=${caseId}&focusSpecies=${lostCase.species}`);
      }
    }
  }

  if (!match || !lostCase || !foundReport) return <p className="p-4 text-slate-500">טוען...</p>;

  return (
    <div className="p-4">
      {/* Reached from several different places (a lost case's own match
          list, a found report's, or the visual-match alert popup) -
          returning to wherever that actually was, not a fixed page, is
          what "back" should mean here. */}
      <BackLink onBack={() => navigate(-1)} to={`/lost/${caseId}`}>
        חזרה לתיק החיפוש
      </BackLink>

      <h1 className="mb-1 text-xl font-bold text-slate-800">ניתוח התאמה מלא</h1>
      <p className="mb-4 text-sm text-slate-500">
        {displayLostCaseName(lostCase)} מול {displayFoundReportName(foundReport)}
      </p>

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">רמת התאמה כוללת:</span>
          <ConfidenceBadge score={match.score} confidenceColors={confidenceColors} />
        </div>
        <button
          type="button"
          onClick={handleRecheck}
          disabled={rechecking}
          className="shrink-0 whitespace-nowrap text-xs text-slate-500 underline disabled:opacity-50"
        >
          {rechecking ? 'סורק מחדש...' : 'בדיקה חוזרת'}
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-600">סטטוס בדיקה:</span>
        <div className="flex items-center gap-2">
          {match.status !== REPORT_STATUS.NOT_RELEVANT && (
            <button
              type="button"
              onClick={() => handleStatusChange(REPORT_STATUS.NOT_RELEVANT)}
              className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500"
            >
              ✕ אין התאמה
            </button>
          )}
          <DropdownBadge
            value={match.status}
            labels={MATCH_STATUS_LABELS}
            onChange={handleStatusChange}
            colorClass={MATCH_STATUS_COLORS[match.status] || 'bg-slate-100 text-slate-600'}
          />
        </div>
      </div>

      {(lostCase.photos?.[0]?.url || foundReport.photos?.[0]?.url) && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-center text-xs text-slate-400">תיק החיפוש</p>
            {lostCase.photos?.[0]?.url ? (
              <button type="button" onClick={() => setLightboxUrl(lostCase.photos[0].url)} className="block w-full">
                <img
                  src={lostCase.photos[0].url}
                  alt=""
                  className="h-40 w-full rounded-lg bg-slate-50 object-contain"
                />
              </button>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg bg-slate-50 text-2xl">🐾</div>
            )}
          </div>
          <div>
            <p className="mb-1 text-center text-xs text-slate-400">הדיווח</p>
            {foundReport.photos?.[0]?.url ? (
              <button type="button" onClick={() => setLightboxUrl(foundReport.photos[0].url)} className="block w-full">
                <img
                  src={foundReport.photos[0].url}
                  alt=""
                  className="h-40 w-full rounded-lg bg-slate-50 object-contain"
                />
              </button>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg bg-slate-50 text-2xl">🐾</div>
            )}
          </div>
        </div>
      )}

      <VisualSimilarityNote visualSimilarity={match.visualSimilarity} disqualified={match.status === REPORT_STATUS.NO_MATCH_PHOTO} />

      <div className="space-y-2">
        {(match.breakdown || []).map((b, i) => {
          const style = VERDICT_STYLES[b.verdict] || VERDICT_STYLES.skipped;
          return (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{b.label}</span>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                  {style.label}
                </span>
              </div>
              <p className="mb-1 text-sm text-slate-500">{b.detail}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  <span className="text-slate-400">תיק החיפוש: </span>
                  {formatFieldValue(b.lostValue)}
                </span>
                <span>
                  <span className="text-slate-400">הדיווח: </span>
                  {formatFieldValue(b.foundValue)}
                </span>
              </div>
              {b.comparisonType === 'markList' && b.pairs?.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                  <p className="text-xs text-slate-400">הסימנים שנמצאה להם התאמה, וכנגד מה בדיוק בצד השני:</p>
                  {b.pairs.map((pair, j) => (
                    <div key={j} className="rounded-lg bg-slate-50 p-2 text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-slate-500">סימן מתיק החיפוש</span>
                        <span className="font-medium text-slate-700">{Math.round(pair.ratio * 100)}% דמיון</span>
                      </div>
                      <p className="text-slate-700">{pair.markA}</p>
                      <p className="mt-1 text-slate-400">מול, בדיווח:</p>
                      <p className="text-slate-700">{pair.markB}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {(!match.breakdown || match.breakdown.length === 0) && (
          <p className="text-sm text-slate-400">
            אין פירוט שמור להתאמה הזו - היא נבדקה לפני שהתווסף הניתוח המלא. בדיקה מחדש של ההתאמות תשמור פירוט מלא.
          </p>
        )}
      </div>

      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
