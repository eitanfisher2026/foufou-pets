import { useState } from 'react';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { buildLostCaseSections } from '../lost-report/lostCaseSections.js';
import { displayFoundReportName } from '../found-report/foundFieldMapping.js';
import { buildFoundReportSections } from '../found-report/foundReportSections.js';
import RecordDetailsDialog from './RecordDetailsDialog.jsx';
import PhotoLightbox from './PhotoLightbox.jsx';

/**
 * Shown when one or more existing records share the exact same source URL
 * as the one being entered now (see duplicateCheckApi.js). Reviewing a
 * match opens a read-only details popup right here (same data the match
 * objects already carry, no extra fetch and no navigating away) rather than
 * opening the existing record's own page, so the in-progress form behind
 * this dialog is never touched.
 *
 * `recordType` is fixed ('lost'|'found') when the caller already knows
 * which collection it's creating in; left unset when it doesn't yet (the
 * smart-add flow, before extraction has classified the post) - in that case
 * each match carries its own `recordType` (see findDuplicatesBySourceUrlAnyType).
 *
 * `mode="submit"` (default) is the pre-creation gate: continue anyway or
 * cancel the new record. `mode="info"` is an earlier heads-up (e.g. right
 * after pulling in a link, before anything else is filled in) where there's
 * nothing to continue or cancel yet - just one acknowledgement button.
 */
export default function DuplicateWarningDialog({ recordType, matches, onContinue, onCancel, mode = 'submit' }) {
  const [reviewing, setReviewing] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const typeOf = (m) => recordType || m.recordType;
  const displayName = (m) => (typeOf(m) === 'lost' ? displayLostCaseName(m) : displayFoundReportName(m));
  const buildSections = (m) => (typeOf(m) === 'lost' ? buildLostCaseSections(m) : buildFoundReportSections(m));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
        <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <h2 className="mb-2 text-lg font-bold text-slate-800">יש כבר רשומה עם אותו קישור מקור</h2>
          <p className="mb-4 text-sm text-slate-600">
            כנראה שכבר קיימת רשומה שנוצרה מאותו פוסט. אפשר לבדוק אותה לפני שממשיכים, כדי למנוע כפילות.
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
                {m.neighborhood && <p className="mt-0.5 text-xs text-slate-400">{m.neighborhood}</p>}
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            {mode === 'submit' ? (
              <>
                <button
                  type="button"
                  onClick={onContinue}
                  className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white"
                >
                  המשך ליצירת רשומה חדשה
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                >
                  ביטול
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white"
              >
                הבנתי
              </button>
            )}
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
