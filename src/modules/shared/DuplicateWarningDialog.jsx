import { useState } from 'react';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { buildLostCaseSections } from '../lost-report/lostCaseSections.js';
import { displayFoundReportName } from '../found-report/foundFieldMapping.js';
import { buildFoundReportSections } from '../found-report/foundReportSections.js';
import RecordDetailsDialog from './RecordDetailsDialog.jsx';
import PhotoLightbox from './PhotoLightbox.jsx';
import { formatDateTime } from './formatDateTime.js';

const MATCH_REASON_LABELS = { sourceUrl: 'אותו קישור מקור', contactPhone: 'אותו מספר טלפון' };

function matchReasonText(m) {
  if (!m.matchedOn?.length) return '';
  return m.matchedOn.map((r) => MATCH_REASON_LABELS[r]).join(' + ');
}

/**
 * Shown when one or more existing records share the same source URL or the
 * same contact phone number as the one being entered now (see
 * duplicateCheckApi.js). Reviewing a match opens a read-only details popup
 * right here (same data the match objects already carry, no extra fetch and
 * no navigating away) rather than opening the existing record's own page,
 * so the in-progress form behind this dialog is never touched.
 *
 * `recordType` is fixed ('lost'|'found') when the caller already knows
 * which collection it's creating in; left unset when it doesn't yet (the
 * smart-add flow, before extraction has classified the post) - in that case
 * each match carries its own `recordType` (see findDuplicatesBySourceUrlAnyType).
 *
 * `mode="submit"` (default) is the pre-creation gate, shown right before an
 * already-filled-in record would be saved. `mode="info"` is an earlier
 * heads-up (e.g. right after pulling in a link, before anything else is
 * filled in) - same two choices, just worded for "keep going" rather than
 * "save this", since nothing's actually being created yet at that point.
 */
export default function DuplicateWarningDialog({ recordType, matches, onContinue, onCancel, mode = 'submit' }) {
  const [reviewing, setReviewing] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const typeOf = (m) => recordType || m.recordType;
  const displayName = (m) => (typeOf(m) === 'lost' ? displayLostCaseName(m) : displayFoundReportName(m));
  const buildSections = (m) => (typeOf(m) === 'lost' ? buildLostCaseSections(m) : buildFoundReportSections(m));
  // Same "no raw ID" rule as lostCaseSections.js/foundReportSections.js -
  // just hide the creator half if no name/email snapshot was saved.
  const creatorOf = (m) => (typeOf(m) === 'lost' ? m.ownerName || m.ownerEmail : m.reporterName || m.reporterEmail);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
        <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <h2 className="mb-2 text-lg font-bold text-slate-800">יש כבר רשומה דומה</h2>
          <p className="mb-4 text-sm text-slate-600">
            כנראה שהמידע הזה כבר דווח בעבר. אפשר לבדוק את הרשומה הקיימת לפני שממשיכים, כדי למנוע כפילות.
          </p>

          <ul className="mb-4 space-y-2">
            {matches.map((m) => (
              <li key={m.id} className="rounded-lg border border-slate-200 p-2">
                <button
                  type="button"
                  onClick={() => setReviewing(m)}
                  className="block w-full text-start text-sm font-medium text-blue-700 underline"
                >
                  {displayName(m)} - פרטים מלאים
                </button>
                {matchReasonText(m) && <p className="mt-0.5 text-xs text-slate-500">{matchReasonText(m)}</p>}
                {m.neighborhood && <p className="mt-0.5 text-xs text-slate-400">{m.neighborhood}</p>}
                {(creatorOf(m) || m.createdAt) && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {creatorOf(m) && `נוצר ע״י ${creatorOf(m)}`}
                    {creatorOf(m) && m.createdAt && ' · '}
                    {m.createdAt && (
                      <span dir="ltr" className="inline-block">
                        {formatDateTime(m.createdAt)}
                      </span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onContinue}
              className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white"
            >
              {mode === 'submit' ? 'המשך ליצירת רשומה חדשה' : 'הוספה בכל זאת'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>

      {reviewing && (
        <RecordDetailsDialog
          title={displayName(reviewing)}
          onClose={() => setReviewing(null)}
          photos={reviewing.photos}
          onViewPhoto={setLightboxUrl}
          sections={buildSections(reviewing)}
        />
      )}
      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </>
  );
}
