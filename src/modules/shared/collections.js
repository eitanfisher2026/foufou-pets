export const COLLECTIONS = {
  LOST_CASES: 'lostCases',
  FOUND_REPORTS: 'foundReports',
};

export const CAT_COLORS = [
  'לבן',
  'שחור',
  'אפור',
  'כתום/ג׳ינג׳י',
  'חום',
  'טאבי (מנומר)',
  'תלת-גוני (קליקו)',
  'שחור-לבן',
  'אחר',
];

// Shared between lost cases and found reports - both describe the same cat
// using the same vocabulary, which also keeps matching (matchingEngine.js)
// comparing like with like instead of a dropdown value against free text.
export const CAT_SIZES = [
  { value: 'small', label: 'קטן/גור' },
  { value: 'medium', label: 'בינוני' },
  { value: 'large', label: 'גדול' },
];

export const CAT_CONDITIONS = [
  { value: 'seen_only', label: 'נראה בלבד (לא נתפס)' },
  { value: 'held_by_finder', label: 'נמצא ונשאר בידי המדווח' },
  { value: 'at_vet', label: 'הועבר למרפאה' },
];

// Lifecycle status of a lost case or found report itself (not to be
// confused with REPORT_STATUS below, which tracks the review status of one
// lost-case/found-report *match*).
export const RECORD_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
  RESOLVED: 'resolved',
};

// "resolved" reads differently for each record type - a lost case resolves
// when the cat is found, a found report resolves when it's returned to its
// owner - so each gets its own label map sharing the same status keys.
export const LOST_CASE_STATUS_LABELS = {
  [RECORD_STATUS.ACTIVE]: 'פעיל - בחיפוש',
  [RECORD_STATUS.SUSPENDED]: 'מושהה',
  [RECORD_STATUS.ARCHIVED]: 'בארכיון',
  [RECORD_STATUS.RESOLVED]: 'נמצא',
};

export const FOUND_REPORT_STATUS_LABELS = {
  [RECORD_STATUS.ACTIVE]: 'פעיל',
  [RECORD_STATUS.SUSPENDED]: 'מושהה',
  [RECORD_STATUS.ARCHIVED]: 'בארכיון',
  [RECORD_STATUS.RESOLVED]: 'טופל - הוחזר לבעלים',
};

export const REPORT_STATUS = {
  NEW: 'new',
  REVIEWING: 'reviewing',
  NEEDS_FOLLOWUP: 'needs_followup',
  NOT_RELEVANT: 'not_relevant',
  LIKELY_MATCH: 'likely_match',
  CONTACTED: 'contacted',
  CLOSED: 'closed',
};
