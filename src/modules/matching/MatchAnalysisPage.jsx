import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getMatch } from './matchingApi.js';
import { getLostCase } from '../lost-report/lostReportApi.js';
import { getFoundReport } from '../found-report/foundReportApi.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { displayFoundReportName } from '../found-report/foundFieldMapping.js';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';
import BackLink from '../shared/BackLink.jsx';
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
 * happened to contribute.
 */
export default function MatchAnalysisPage() {
  const { caseId, foundReportId } = useParams();
  const [match, setMatch] = useState(null);
  const [lostCase, setLostCase] = useState(null);
  const [foundReport, setFoundReport] = useState(null);
  const [confidenceColors, setConfidenceColors] = useState(undefined);

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

  if (!match || !lostCase || !foundReport) return <p className="p-4 text-slate-500">טוען...</p>;

  return (
    <div className="p-4">
      <BackLink to={`/lost/${caseId}`}>חזרה לתיק החיפוש</BackLink>

      <h1 className="mb-1 text-xl font-bold text-slate-800">ניתוח התאמה מלא</h1>
      <p className="mb-4 text-sm text-slate-500">
        {displayLostCaseName(lostCase)} מול {displayFoundReportName(foundReport)}
      </p>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">רמת התאמה כוללת:</span>
        <ConfidenceBadge score={match.score} confidenceColors={confidenceColors} />
      </div>

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
            </div>
          );
        })}
        {(!match.breakdown || match.breakdown.length === 0) && (
          <p className="text-sm text-slate-400">
            אין פירוט שמור להתאמה הזו - היא נבדקה לפני שהתווסף הניתוח המלא. בדיקה מחדש של ההתאמות תשמור פירוט מלא.
          </p>
        )}
      </div>
    </div>
  );
}
