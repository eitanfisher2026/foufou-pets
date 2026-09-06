import { REPORT_STATUS } from '../shared/collections.js';

// Shared between LostCaseDetail (lost-case -> found-reports matching) and
// FoundReportDetail (the reverse direction) - both display the exact same
// REPORT_STATUS values on a match, just starting from opposite ends of the
// same underlying match record (see matchingApi.js).
//
// REPORT_STATUS.NEW's label is "ממתין לבדיקה" (awaiting review), not "חדש"
// (new) - it means the algorithm already scored this pairing and a person
// hasn't set a status on it yet. "New" is reserved for candidates the
// algorithm hasn't compared at all yet (see the check button's own count,
// computed separately - matchingApi.js's countNewCandidatesForLostCase/
// countNewCandidatesForFoundReport), which is a different thing entirely.
export const MATCH_STATUS_LABELS = {
  [REPORT_STATUS.NEW]: 'ממתין לבדיקה',
  [REPORT_STATUS.NO_MATCH]: 'האלגוריתם קבע: אין התאמה',
  [REPORT_STATUS.NO_MATCH_PHOTO]: 'השוואת תמונות AI: אין התאמה',
  [REPORT_STATUS.REVIEWING]: 'בבדיקה',
  [REPORT_STATUS.NEEDS_FOLLOWUP]: 'דורש מעקב',
  [REPORT_STATUS.NOT_RELEVANT]: 'נבדק ולא נמצא קשר',
  [REPORT_STATUS.LIKELY_MATCH]: 'בעל סבירות גבוהה',
  [REPORT_STATUS.CONTACTED]: 'נוצר קשר עם המדווח',
  [REPORT_STATUS.CLOSED]: 'נסגר',
};

// Display order for the collapsible per-status sections below the pending-
// review list (see LostCaseDetail.jsx/FoundReportDetail.jsx) - every status
// except NEW, which gets its own always-open "ממתינות לבדיקה" section
// instead. The two automatic no-match outcomes are deliberately last: a
// person actually decided every status ahead of them, so those two -
// nobody chose them, the algorithm just ruled the pair out - read as the
// least interesting group to open first.
export const MATCH_STATUS_DISPLAY_ORDER = [
  REPORT_STATUS.REVIEWING,
  REPORT_STATUS.NEEDS_FOLLOWUP,
  REPORT_STATUS.NOT_RELEVANT,
  REPORT_STATUS.LIKELY_MATCH,
  REPORT_STATUS.CONTACTED,
  REPORT_STATUS.CLOSED,
  REPORT_STATUS.NO_MATCH,
  REPORT_STATUS.NO_MATCH_PHOTO,
];

export const MATCH_STATUS_COLORS = {
  [REPORT_STATUS.NEW]: 'bg-amber-100 text-amber-800',
  [REPORT_STATUS.NO_MATCH]: 'bg-slate-100 text-slate-600',
  [REPORT_STATUS.NO_MATCH_PHOTO]: 'bg-rose-100 text-rose-700',
  [REPORT_STATUS.REVIEWING]: 'bg-blue-100 text-blue-800',
  [REPORT_STATUS.NEEDS_FOLLOWUP]: 'bg-amber-100 text-amber-800',
  [REPORT_STATUS.NOT_RELEVANT]: 'bg-slate-100 text-slate-600',
  [REPORT_STATUS.LIKELY_MATCH]: 'bg-emerald-100 text-emerald-800',
  [REPORT_STATUS.CONTACTED]: 'bg-blue-100 text-blue-800',
  [REPORT_STATUS.CLOSED]: 'bg-slate-200 text-slate-600',
};
