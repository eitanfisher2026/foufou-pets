import { Link } from 'react-router-dom';
import { RECORD_STATUS } from '../shared/collections.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { displayFoundReportName } from '../found-report/foundFieldMapping.js';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';

// Shared between the dashboard's default list, the full found-reports
// browsing page, and the archive page, so the same case/report always
// looks the same no matter which list it's showing up in.

const STATUS_BADGE_COLORS = {
  [RECORD_STATUS.SUSPENDED]: 'bg-amber-100 text-amber-800',
  [RECORD_STATUS.ARCHIVED]: 'bg-slate-200 text-slate-600',
  [RECORD_STATUS.RESOLVED]: 'bg-blue-100 text-blue-800',
};

export function StatusBadge({ status, labels }) {
  if (!status || status === RECORD_STATUS.ACTIVE) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {labels[status] || status}
    </span>
  );
}

// The total candidate count (matchCount) belongs in the section header, not
// repeated on every row. Reviewed/new counts are plain text - only the
// confidence level itself is a color-coded badge, kept visually separate.
export function MatchSummaryRow({ matchCount, newMatchCount, topMatchScore, confidenceColors }) {
  const hasNew = newMatchCount > 0;
  const reviewedCount = matchCount - newMatchCount;
  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-xs text-black">
        {hasNew && `${newMatchCount} לבדיקה, `}
        {reviewedCount} נבדקו
      </span>
      <ConfidenceBadge score={topMatchScore} confidenceColors={confidenceColors} />
    </div>
  );
}

export function LostCaseRow({ lostCase: c, statusLabels, confidenceColors }) {
  return (
    <li>
      <Link to={`/lost/${c.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{displayLostCaseName(c)}</span>
          <StatusBadge status={c.status} labels={statusLabels} />
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
  );
}

export function FoundReportRow({ report: r, statusLabels }) {
  return (
    <li>
      <Link to={`/found/${r.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{displayFoundReportName(r)}</span>
          <StatusBadge status={r.status} labels={statusLabels} />
        </div>
        <p className="mt-1 truncate text-xs text-slate-400">{r.neighborhood}</p>
        {r.sourceGroupName && <p className="mt-1 text-xs text-slate-400">מקור: {r.sourceGroupName}</p>}
      </Link>
    </li>
  );
}
