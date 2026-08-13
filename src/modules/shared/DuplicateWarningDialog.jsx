import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { displayFoundReportName } from '../found-report/foundFieldMapping.js';

/**
 * Shown right before submitting a new lost/found record when one or more
 * existing records share the exact same source URL (see
 * duplicateCheckApi.js). Reviewing a match opens it in a new tab rather
 * than navigating away, so the in-progress form (and this dialog) is never
 * lost - the person can go check the existing record and still come back
 * to continue or cancel the new one.
 */
export default function DuplicateWarningDialog({ recordType, matches, onContinue, onCancel }) {
  const displayName = recordType === 'lost' ? displayLostCaseName : displayFoundReportName;
  const detailPath = (id) => (recordType === 'lost' ? `/lost/${id}` : `/found/${id}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-lg font-bold text-slate-800">יש כבר רשומה עם אותו קישור מקור</h2>
        <p className="mb-4 text-sm text-slate-600">
          כנראה שכבר קיימת רשומה שנוצרה מאותו פוסט. אפשר לבדוק אותה לפני שממשיכים, כדי למנוע כפילות.
        </p>

        <ul className="mb-4 space-y-2">
          {matches.map((m) => (
            <li key={m.id} className="rounded-lg border border-slate-200 p-2">
              <a
                href={detailPath(m.id)}
                target="_blank"
                rel="noreferrer"
                className="block text-sm font-medium text-blue-700 underline"
              >
                {displayName(m)} - צפייה ברשומה הקיימת
              </a>
              {m.neighborhood && <p className="mt-0.5 text-xs text-slate-400">{m.neighborhood}</p>}
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
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
        </div>
      </div>
    </div>
  );
}
