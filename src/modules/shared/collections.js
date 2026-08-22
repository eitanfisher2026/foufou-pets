export const COLLECTIONS = {
  LOST_CASES: 'lostCases',
  FOUND_REPORTS: 'foundReports',
};

// Cats and dogs only, by design - not a generic species registry. Every
// place that branches on species (labels, color/breed lists, matching)
// switches on exactly these two values; adding a third species later would
// need those switches extended, not a redesign.
export const SPECIES = {
  CAT: 'cat',
  DOG: 'dog',
};

export const SPECIES_LABELS = {
  [SPECIES.CAT]: 'חתול',
  [SPECIES.DOG]: 'כלב',
};

// Default/fallback list only - the live, editable list (which the settings
// panel writes to Firestore at config/colorOptions, keyed by species) is
// what forms actually show; see shared/colorOptionsApi.js. This constant is
// what a fresh project starts with before anyone has customized it. "אחר"
// (other) is a fixed catch-all, always last, never part of the editable list.
// Base color only, not pattern - "תלת-גוני" (tricolor) stays here since it's
// still a base coloring fact, but the striped/mottled "tabby" pattern moved
// out entirely to CAT_PATTERNS below (a cat can be color="תלת-גוני" AND
// pattern="קליקו" at once - that's expected, not a conflict). Bicolor
// combos with white (ג׳ינג׳י לבן/אפור לבן/שחור-לבן) stay as their own
// named colors rather than decomposing into color+pattern too - those
// combos are how people actually identify a cat at a glance ("the cat
// isn't black and isn't white"), which the AI reads just as reliably as a
// single hue.
export const CAT_COLORS = [
  'לבן',
  'שחור',
  'אפור',
  'כתום/ג׳ינג׳י',
  'קרם',
  'חום',
  'ג׳ינג׳י לבן',
  'אפור לבן',
  'תלת-גוני',
  'שחור-לבן',
  'אחר',
];

// Cat-only coat pattern, separate from base color - see CAT_COLORS above
// for why. Live-editable via config/patternOptions, same convention as
// colors/breeds (see patternOptionsApi.js). "אחיד" (solid/no distinct
// pattern) is the common default, not the absence of an answer - most
// cats simply have no special pattern, so this is a real, required
// classification rather than a nullable field.
export const CAT_PATTERNS = [
  'אחיד',
  'טאבי (מנומר)',
  'קליקו',
  'טורטי',
  'טוקסידו',
  'פוינט (קצוות כהות)',
  'אחר',
];

// Plain-language explanation shown under each pattern option in the picker -
// cat-fancy terms like "טוקסידו"/"פוינט" aren't obvious by name alone. Keyed
// separately from CAT_PATTERNS (not baked into it) since a custom pattern
// someone adds via the settings panel is just a name, with no description
// to show.
export const CAT_PATTERN_DESCRIPTIONS = {
  'אחיד': 'צבע אחיד בלבד, בלי תבנית מיוחדת',
  'טאבי (מנומר)': 'פסים או כתמים על פני כל הגוף',
  קליקו: 'כתמים לבנים, שחורים וכתומים יחד',
  טורטי: 'ערבוב של שחור וכתום/קרם זה בתוך זה, כמעט בלי לבן',
  טוקסידו: 'בעיקר שחור, עם חזה/בטן/כפות לבנות בצורה סימטרית - כמו חליפה',
  'פוינט (קצוות כהות)': 'גוף בהיר (בדרך כלל לבן/קרם) עם פנים ואוזניים בצבע כהה משמעותית מהגוף (לרוב גם רגליים וזנב) - כמו סיאמי או ראגדול',
};

// Dog coat colors/patterns don't overlap well with CAT_COLORS (no
// tabby/calico, but brindle/merle/tan-points that cats don't have) - a
// separate list, same "אחר" catch-all convention.
export const DOG_COLORS = [
  'שחור',
  'לבן',
  'חום',
  'זהוב',
  'שחור-חום (בְּלֶק אנד טאן)',
  'ברינדל (מנומר בפסים)',
  'מנומר (מֶרְל)',
  'שחור-לבן',
  'חום-לבן',
  'אחר',
];

// Default/fallback list only - same "live editable list in Firestore"
// pattern as colors (config/breedOptions, see breedOptionsApi.js). "אחר" is
// the fixed catch-all, and the settings panel can extend the rest without a
// code change. Both species get a real picklist now (a first "mixed/street"
// entry covers the overwhelming default case for either), but they're kept
// as two separate lists rather than one merged one: the two vocabularies
// barely overlap, and the AI extraction schema enum-constrains each species
// to only its own list.
export const CAT_BREEDS = [
  'מעורב / חתול רחוב',
  'פרסי',
  'מיין קון',
  'בנגלי',
  'סיאמי',
  'בריטי/סקוטי',
  'ראגדול',
  'ספינקס',
  'אבסיני',
  'יער נורווגי',
  'אמריקן שורטהייר',
  'רוסי כחול',
  'אחר',
];

// Skewed toward breeds common in Israel.
export const DOG_BREEDS = [
  'מעורב (לא ידוע)',
  'לברדור',
  'גולדן רטריבר',
  'רועה גרמני',
  'האסקי סיברי',
  'פודל',
  'ביגל',
  'יורקשייר טרייר',
  'ג׳ק ראסל',
  'שיצו',
  'צ׳יוואווה',
  'בורדר קולי',
  'קולי',
  'קוקר ספניאל',
  'רוטוויילר',
  'דוברמן',
  'בוקסר',
  'שנאוצר',
  'מלטז',
  'קאן קורסו',
  'אמריקן סטפורדשייר (פיטבול)',
  'פינצ׳ר',
  'פומרניאן',
  'אחר',
];

// The "breed not identified" default a dog record gets - both from the AI
// extraction (its breed enum always includes this as the safe fallback
// choice) and as the value BreedCheckDialog nudges the user away from.
export const DEFAULT_DOG_BREED = DOG_BREEDS[0];

// Same idea for cats, but only used to pre-fill a brand-new manual form
// (see LostReportForm.jsx/FoundReportForm.jsx) - not a post-creation nudge
// like DEFAULT_DOG_BREED, since the overwhelming majority of cat reports
// really are street/mixed cats and don't need a second look.
export const DEFAULT_CAT_BREED = CAT_BREEDS[0];

// Shared between cats and dogs, and between lost cases and found reports -
// all four describe the same animal using the same vocabulary, which also
// keeps matching (matchingEngine.js) comparing like with like instead of a
// dropdown value against free text.
export const CAT_SIZES = [
  { value: 'small', label: 'קטן' },
  { value: 'medium', label: 'בינוני' },
  { value: 'large', label: 'גדול' },
];

// Separate from size - a small adult and a young animal are a very
// different matching signal, so they're no longer conflated into one
// dropdown. Labels are deliberately species-neutral ("גור" reads naturally
// for a kitten or a puppy in Hebrew) - the underlying value name ("kitten")
// is an internal key only, never shown to a user.
export const CAT_AGE_CLASSES = [
  { value: 'kitten', label: 'גור' },
  { value: 'adult', label: 'מבוגר' },
];

// Real coat taxonomy has more nuance (length/texture/density/double coat),
// but for reliable classification from a photo by a non-expert (or by AI),
// a few buckets covering length (+ for dogs, the one texture that's
// visually unmistakable: curly/wavy) is the practical limit - a
// fluffy/bushy tail is tracked as its own separate trait below since it
// can stand out even on an otherwise short-coated animal. Cats don't get
// a "curly" option: a genuinely curly-coated cat (Devon/Cornish Rex) is
// rare enough in these reports that it's not worth the confusion of an
// option that almost never applies, unlike a Poodle for dogs.
export const CAT_FUR_TYPES = [
  { value: 'hairless', label: 'ללא פרווה / כמעט ללא פרווה' },
  { value: 'short', label: 'רגיל' },
  { value: 'long', label: 'שיער ארוך' },
];

// Dogs keep the "curly" texture option cats don't (Poodle/Bichon etc. are
// common enough to warrant it) - see CAT_FUR_TYPES above.
export const DOG_FUR_TYPES = [
  { value: 'hairless', label: 'ללא פרווה / כמעט ללא פרווה' },
  { value: 'short', label: 'רגיל' },
  { value: 'long', label: 'שיער ארוך' },
  { value: 'curly', label: 'מתולתל / גלי' },
];

export const COLLAR_COLORS = ['אדום', 'כחול', 'ורוד', 'שחור', 'לבן', 'צהוב', 'ירוק', 'כתום', 'סגול', 'צבעוני/כמה צבעים', 'אחר'];

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

// Why a lost case was closed (RECORD_STATUS.ARCHIVED or RESOLVED) - shown
// and filterable on the archive page. Separate from RECORD_STATUS itself:
// that still controls whether the case shows up on the working dashboard,
// this is just the detail of what actually happened.
export const CLOSURE_REASON = {
  RETURNED_TO_OWNER: 'returned_to_owner',
  NOT_FOUND_TOO_LONG: 'not_found_too_long',
  DIED: 'died',
  OTHER: 'other',
};

export const CLOSURE_REASON_LABELS = {
  [CLOSURE_REASON.RETURNED_TO_OWNER]: 'הוחזר/ה לבעלים',
  [CLOSURE_REASON.NOT_FOUND_TOO_LONG]: 'לא אותר/ה זמן רב',
  [CLOSURE_REASON.DIED]: 'נפטר/ה',
  [CLOSURE_REASON.OTHER]: 'אחר',
};

export const REPORT_STATUS = {
  NEW: 'new',
  // Set automatically (never by a person) when a fresh match scores 0/100 -
  // distinct from NOT_RELEVANT, which means a person looked at it and ruled
  // it out. Keeps a hard-disqualified pair out of the "needs review" count
  // without pretending someone actually reviewed it.
  NO_MATCH: 'no_match',
  // The photo-comparison sibling of NO_MATCH above - also automatic, also
  // means the algorithm itself ruled the pair out, just discovered a step
  // later by the AI photo check (verdict "likely_different") rather than by
  // the field comparison. Kept distinct from NO_MATCH so the reason a pair
  // was ruled out ("fields don't line up" vs. "fields lined up but the
  // photos clearly don't") stays visible instead of collapsing into one
  // generic bucket. When this fires, the match's score is forced to 0 and
  // its reasons record the AI's explanation, same as any other disqualifying
  // field - see applyVisualVerdict in matchingApi.js.
  NO_MATCH_PHOTO: 'no_match_photo',
  REVIEWING: 'reviewing',
  NEEDS_FOLLOWUP: 'needs_followup',
  NOT_RELEVANT: 'not_relevant',
  LIKELY_MATCH: 'likely_match',
  CONTACTED: 'contacted',
  CLOSED: 'closed',
};
