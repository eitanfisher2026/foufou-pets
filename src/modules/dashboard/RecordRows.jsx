import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RECORD_STATUS } from '../shared/collections.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { displayFoundReportName } from '../found-report/foundFieldMapping.js';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';
import PhotoLightbox from '../shared/PhotoLightbox.jsx';

// Shared between the dashboard's default list, the full found-reports
// browsing page, the archive page, and search results, so the same case/
// report always looks the same no matter which list it's showing up in.

const STATUS_BADGE_COLORS = {
  [RECORD_STATUS.SUSPENDED]: 'bg-amber-100 text-amber-800',
  [RECORD_STATUS.ARCHIVED]: 'bg-slate-200 text-slate-600',
  [RECORD_STATUS.RESOLVED]: 'bg-blue-100 text-blue-800',
};

function StatusBadge({ status, labels }) {
  if (!status || status === RECORD_STATUS.ACTIVE) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {labels[status] || status}
    </span>
  );
}

// Used only where lost and found records are shown mixed together (a
// combined search across both) - the record number's own prefix already
// says which type it is (LC/LD = lost, FC/FD = found, see
// recordNumberApi.js), so this reads that instead of tracking a separate
// "is this a lost or found row" flag. Falls back to a plain lost/found word
// for a record that predates numbering and hasn't been backfilled yet.
function typeBadgeFromRecordNumber(recordNumber, fallbackLabel) {
  const isLost = recordNumber ? recordNumber.startsWith('L') : fallbackLabel === 'אבד';
  return {
    label: recordNumber || fallbackLabel,
    colorClass: isLost ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
  };
}

// The total candidate count (matchCount) belongs in the section header, not
// repeated on every row. Reviewed/new counts are plain text - only the
// confidence level and the important-matches call-out are color-coded
// badges, kept visually separate. "X נבדקו" alone used to be the only
// signal a reviewed match ever showed here - it hides whether any of those
// reviewed matches are actually worth a look (a follow-up flag, contact
// already made, a likely match), so importantMatchCount (see
// isImportantMatchStatus in matchStatusLabels.js, kept in sync in
// matchingApi.js) gets its own badge whenever it's nonzero.
export function MatchSummaryRow({ matchCount, newMatchCount, importantMatchCount, topMatchScore, confidenceColors }) {
  const hasNew = newMatchCount > 0;
  const reviewedCount = matchCount - newMatchCount;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="whitespace-nowrap text-xs text-black">
        {hasNew && `${newMatchCount} לבדיקה, `}
        {reviewedCount} נבדקו
      </span>
      <ConfidenceBadge score={topMatchScore} confidenceColors={confidenceColors} />
      {importantMatchCount > 0 && (
        <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          ⚠️ {importantMatchCount} דורשות תשומת לב
        </span>
      )}
    </div>
  );
}

// The photo sits outside the row's own <Link> (as a sibling <button>, not
// nested inside it) - a button inside an anchor is invalid HTML and some
// browsers handle the click-through oddly, so the photo needs its own tap
// target with its own stopPropagation instead of living inside the link
// that opens the record's detail page.
//
// The paw placeholder is always in the DOM, not just a fallback for a
// missing photo - it's the visible state until that specific image
// actually finishes loading, so a long list never shows a bare gap that
// then pops a photo in at whatever moment the network happens to deliver
// it (lazy-loaded images across a list resolve in whatever order the
// browser gets to them, not top-to-bottom). object-top instead of the
// default centered crop, because a pet photo's subject is almost always
// framed in the upper part of the shot - centering a tight square crop
// routinely cut the head off.
function RowThumbnail({ photo, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        if (!photo) return;
        e.preventDefault();
        e.stopPropagation();
        onOpen(photo.url);
      }}
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100"
      aria-label={photo ? 'הצגת תמונה' : undefined}
      tabIndex={photo ? 0 : -1}
    >
      {(!photo || !loaded) && (
        <div className="absolute inset-0 flex items-center justify-center text-2xl">🐾</div>
      )}
      {photo && (
        <img
          src={photo.thumbUrl || photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`h-16 w-16 object-cover object-top transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </button>
  );
}

export function LostCaseRow({ lostCase: c, statusLabels, confidenceColors, showTypeBadge, highlighted }) {
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const typeBadge = showTypeBadge ? typeBadgeFromRecordNumber(c.recordNumber, 'אבד') : null;
  return (
    <li
      id={`case-${c.id}`}
      className={`flex items-start gap-3 rounded-xl border bg-white p-3 hover:bg-slate-50 ${
        highlighted ? 'border-blue-400 ring-2 ring-blue-400 ring-offset-2' : 'border-slate-200'
      }`}
    >
      <RowThumbnail photo={c.photos?.[0]} onOpen={setLightboxUrl} />
      <Link to={`/lost/${c.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{displayLostCaseName(c)}</span>
          {typeBadge && (
            <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge.colorClass}`}>
              {typeBadge.label}
            </span>
          )}
          <StatusBadge status={c.status} labels={statusLabels} />
        </div>
        <p className="mt-1 truncate text-xs text-slate-400">{c.neighborhood}</p>
        {c.hasVisualMatch && (
          <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            🔎 AI זיהה דמיון חזותי
          </span>
        )}
        {c.matchCount > 0 && (
          <div className="mt-1">
            <MatchSummaryRow
              matchCount={c.matchCount}
              newMatchCount={c.newMatchCount}
              importantMatchCount={c.importantMatchCount}
              topMatchScore={c.topMatchScore}
              confidenceColors={confidenceColors}
            />
          </div>
        )}
      </Link>
      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </li>
  );
}

export function FoundReportRow({ report: r, statusLabels, showTypeBadge, highlighted }) {
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const typeBadge = showTypeBadge ? typeBadgeFromRecordNumber(r.recordNumber, 'נמצא') : null;
  return (
    <li
      id={`report-${r.id}`}
      className={`flex items-start gap-3 rounded-xl border bg-white p-3 hover:bg-slate-50 ${
        highlighted ? 'border-blue-400 ring-2 ring-blue-400 ring-offset-2' : 'border-slate-200'
      }`}
    >
      <RowThumbnail photo={r.photos?.[0]} onOpen={setLightboxUrl} />
      <Link to={`/found/${r.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{displayFoundReportName(r)}</span>
          {typeBadge && (
            <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge.colorClass}`}>
              {typeBadge.label}
            </span>
          )}
          <StatusBadge status={r.status} labels={statusLabels} />
        </div>
        <p className="mt-1 truncate text-xs text-slate-400">{r.neighborhood}</p>
        {r.hasVisualMatch && (
          <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            🔎 AI זיהה דמיון חזותי
          </span>
        )}
        {r.sourceGroupName && <p className="mt-1 text-xs text-slate-400">מקור: {r.sourceGroupName}</p>}
      </Link>
      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </li>
  );
}
