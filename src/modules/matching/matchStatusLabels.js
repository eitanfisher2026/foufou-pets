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
  // Covers what used to be its own "בעל סבירות גבוהה" status too - a likely
  // match is itself a reason to follow up, not a meaningfully different
  // state (see the REPORT_STATUS comment in collections.js and the
  // migration in matchingApi.js that folded existing matches into this).
  [REPORT_STATUS.NEEDS_FOLLOWUP]: 'דורש מעקב',
  [REPORT_STATUS.NOT_RELEVANT]: 'נבדק ולא נמצא קשר',
  [REPORT_STATUS.CONTACTED]: 'נוצר קשר עם המדווח',
  [REPORT_STATUS.CLOSED]: 'נסגר',
};

// How much a status actually matters once a person has looked at it -
// higher means more important/more likely to need real attention, not just
// chronological order. Everything else here (both dropdown/section display
// order, and which statuses count as "important" enough to call out on a
// case's own row in the main list) derives from this one ranking instead
// of being ordered by hand in more than one place. NEW isn't ranked - it's
// not a decided status at all, and always gets its own always-open
// "ממתינות לבדיקה" section/first dropdown entry instead of one of these.
export const MATCH_STATUS_PRIORITY = {
  [REPORT_STATUS.NO_MATCH]: 1, // automatic, fully settled, never needs a second look
  [REPORT_STATUS.NO_MATCH_PHOTO]: 2, // automatic, fully settled
  [REPORT_STATUS.NOT_RELEVANT]: 3, // a person already ruled it out - no follow-up needed, same as the two above
  [REPORT_STATUS.CLOSED]: 4, // the pairing's story is over, whatever it was
  [REPORT_STATUS.REVIEWING]: 5, // actively being looked at
  [REPORT_STATUS.NEEDS_FOLLOWUP]: 6, // explicitly flagged as needing action (including a likely match)
  [REPORT_STATUS.CONTACTED]: 7, // real progress - the reporter's been reached, most urgent
};

// Least-important-first, matching the ranking above - the collapsible
// sections below the pending-review list (see LostCaseDetail.jsx/
// FoundReportDetail.jsx) and the status dropdown (see ORDERED_MATCH_STATUSES
// below) both use this order.
export const MATCH_STATUS_DISPLAY_ORDER = Object.keys(MATCH_STATUS_PRIORITY).sort(
  (a, b) => MATCH_STATUS_PRIORITY[a] - MATCH_STATUS_PRIORITY[b]
);

// Every status a person can actually pick, in display order, NEW first -
// what the status-change dropdown (see DropdownBadge's `order` prop) renders
// in, instead of relying on plain object key order.
export const ORDERED_MATCH_STATUSES = [REPORT_STATUS.NEW, ...MATCH_STATUS_DISPLAY_ORDER];

// The statuses worth calling out on a case's own row in the main list (see
// MatchSummaryRow in RecordRows.jsx) - a plain "64 נבדקו" count hides
// whether any of those 64 are actually significant. Threshold is
// NEEDS_FOLLOWUP's own priority, so "important" reads as "at least as
// worth a look as an explicit follow-up flag" - currently NEEDS_FOLLOWUP
// and CONTACTED.
const IMPORTANT_THRESHOLD = MATCH_STATUS_PRIORITY[REPORT_STATUS.NEEDS_FOLLOWUP];
export function isImportantMatchStatus(status) {
  return (MATCH_STATUS_PRIORITY[status] || 0) >= IMPORTANT_THRESHOLD;
}

export const MATCH_STATUS_COLORS = {
  [REPORT_STATUS.NEW]: 'bg-amber-100 text-amber-800',
  [REPORT_STATUS.NO_MATCH]: 'bg-slate-100 text-slate-600',
  [REPORT_STATUS.NO_MATCH_PHOTO]: 'bg-rose-100 text-rose-700',
  [REPORT_STATUS.REVIEWING]: 'bg-blue-100 text-blue-800',
  [REPORT_STATUS.NEEDS_FOLLOWUP]: 'bg-amber-100 text-amber-800',
  [REPORT_STATUS.NOT_RELEVANT]: 'bg-slate-100 text-slate-600',
  [REPORT_STATUS.CONTACTED]: 'bg-blue-100 text-blue-800',
  [REPORT_STATUS.CLOSED]: 'bg-slate-200 text-slate-600',
};
