/**
 * Deterministic, explainable scoring - no AI call here on purpose. This runs
 * for every lost-case x found-report pair, so it has to stay free and instant;
 * the one AI call per report already happened at intake (screenshot reading).
 * Never filters anything out - only ranks - because a false "no match" is
 * worse than making the owner look at one more weak card.
 *
 * Rule-based, not a fixed formula: the set of compared fields and their
 * weights lives in a config object (see DEFAULT_MATCH_CONFIG below and
 * matchConfigApi.js), editable from the settings panel without a code
 * change - as long as the field being compared already exists on the
 * records and fits one of the four comparison methods below. Adding a
 * parameter for a field that doesn't exist yet still needs real work (a
 * new form field, possibly AI extraction support) - only the weighting and
 * on/off state are pure configuration.
 */

const DATE_PROXIMITY_CUTOFF_DAYS = 14;

// Default color-similarity groups: colors placed in the same group are
// treated as "can't tell apart from a photo" (e.g. lighting/white balance
// making white look gray) rather than a real mismatch - editable from the
// settings panel (config.colorGroups), not fixed in code. Values must
// reference CAT_COLORS in src/modules/shared/collections.js. Any color
// disagreement outside a shared group, including solid vs. patterned (a
// solid-colored cat can't become tabby/calico/bi-color or vice versa), is
// treated as a real mismatch. "אחר" (other) is excluded entirely - it's an
// AI catch-all with no reliable meaning, so a comparison involving it is
// inconclusive, not a mismatch.
export const DEFAULT_COLOR_GROUPS = [['לבן', 'אפור']];

// A raw "45/100" or "100%" reads as false precision - two cats that don't
// even look alike can still land on 100 under relative scoring if the few
// fields both sides filled in happen to agree. Bucketing into four plain-
// language confidence levels (with a settings-configurable color per
// bucket) is honest about what the score actually is: a rough signal, not
// a measurement.
export const CONFIDENCE_BUCKETS = [
  { key: 'noMatch', label: 'אין התאמה', min: 0, max: 0 },
  { key: 'low', label: 'סבירות נמוכה', min: 1, max: 39 },
  { key: 'medium', label: 'סבירות בינונית', min: 40, max: 69 },
  { key: 'high', label: 'סבירות גבוהה', min: 70, max: 100 },
];

export const DEFAULT_CONFIDENCE_COLORS = { noMatch: 'gray', low: 'yellow', medium: 'orange', high: 'green' };

// Tailwind needs literal class strings to find them at build time - this
// fixed small palette is the only set of colors the settings panel offers,
// so every class name it could ever need already appears here literally.
export const CONFIDENCE_COLOR_PALETTE = {
  gray: { label: 'אפור', badge: 'bg-slate-100 text-slate-700' },
  yellow: { label: 'צהוב', badge: 'bg-yellow-100 text-yellow-800' },
  orange: { label: 'כתום', badge: 'bg-orange-100 text-orange-800' },
  green: { label: 'ירוק', badge: 'bg-emerald-100 text-emerald-800' },
  red: { label: 'אדום', badge: 'bg-red-100 text-red-800' },
  blue: { label: 'כחול', badge: 'bg-blue-100 text-blue-800' },
};

/** Maps a raw 0-100 score to its confidence bucket ({ key, label }). */
export function getMatchConfidence(score) {
  return CONFIDENCE_BUCKETS.find((b) => score >= b.min && score <= b.max) || CONFIDENCE_BUCKETS[0];
}

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[.,!?"'()]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

// Every comparator returns null when there isn't enough info on both sides
// to compare (missing fields never help or hurt a score), or { ratio, ...detail }
// where ratio is 0-1 for scaled types, or exactly 0/1 for exact matches.

function compareExact(a, b) {
  if (a === null || a === undefined || a === '' || b === null || b === undefined || b === '') return null;
  const na = typeof a === 'string' ? a.trim().toLowerCase() : a;
  const nb = typeof b === 'string' ? b.trim().toLowerCase() : b;
  return { ratio: na === nb ? 1 : 0 };
}

// For a rare, permanent marking (e.g. a clipped ear tip) where "false" just
// means "doesn't have this marking" - the common default for most cats, not
// evidence of anything. Both sides being false proves nothing about
// identity, so it's treated as not comparable, same as missing data -
// unlike compareExact, where false/false would wrongly score as a match.
// Both true is a real positive signal; true vs false is a real mismatch
// (the marking doesn't appear or disappear over time), so that's still
// penalized like any other exact mismatch.
function compareBooleanTrait(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (a === false && b === false) return null;
  return { ratio: a === b ? 1 : 0 };
}

// Generalizes compareBooleanTrait to a multi-value enum with one baseline
// "nothing distinctive here" value (e.g. an ordinary short coat, set via
// the parameter's defaultValue) - two records both landing on that
// baseline isn't informative, so it's treated as not comparable, same as
// missing data. Matching on any other value is a real positive signal, and
// any disagreement (baseline or not) is still a real mismatch, since the
// trait itself doesn't change between a cat being lost and found.
function compareExactSkipDefault(a, b, ctx) {
  if (a === null || a === undefined || a === '' || b === null || b === undefined || b === '') return null;
  if (a === ctx?.defaultValue && b === ctx?.defaultValue) return null;
  return { ratio: a === b ? 1 : 0 };
}

// Color-aware comparison: exact match scores full, two colors placed in
// the same configured group (config.colorGroups, defaults to
// DEFAULT_COLOR_GROUPS) score partial credit since they could be the same
// cat photographed under different lighting, and any other disagreement
// (including solid vs. patterned) scores a hard 0.
function compareColor(a, b, ctx) {
  if (!a || !b) return null;
  if (a === 'אחר' || b === 'אחר') return null;
  if (a === b) return { ratio: 1 };
  const groups = ctx?.colorGroups || DEFAULT_COLOR_GROUPS;
  const sameGroup = groups.some((group) => group.includes(a) && group.includes(b));
  if (sameGroup) return { ratio: 0.6 };
  return { ratio: 0 };
}

function compareTextOverlap(a, b) {
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));
  if (wordsA.size === 0 || wordsB.size === 0) return null;
  let shared = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) shared += 1;
  }
  return { ratio: shared / Math.max(wordsA.size, wordsB.size) };
}

function splitMarks(text) {
  if (!text) return [];
  return text
    .split(/\r?\n|[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Treats a marks field as a list of distinct marks (one per line, or comma-
// separated) instead of one bag of words. A field with two unrelated marks
// concatenated - "black spot near the nose, short ears" - shouldn't get
// word-overlap credit for one mark just because the other happens to share
// a word with something unrelated on the other side. Each mark on the lost
// side is matched against its single best-matching mark on the found side,
// and the score is the average of those best-match ratios.
function compareMarkList(a, b) {
  const marksA = splitMarks(a);
  const marksB = splitMarks(b);
  if (marksA.length === 0 || marksB.length === 0) return null;

  let total = 0;
  for (const markA of marksA) {
    let best = 0;
    for (const markB of marksB) {
      const overlap = compareTextOverlap(markA, markB);
      if (overlap && overlap.ratio > best) best = overlap.ratio;
    }
    total += best;
  }
  return { ratio: total / marksA.length };
}

// Needs real calendar dates (e.g. an <input type="date"> value), not the
// literal "as written in the post" text fields (lastSeenAt/dateText), which
// are deliberately left uncalculated (could be "3 days ago" or a holiday
// name) - those still display for human context but were never something
// proximity math could safely run on.
//
// When either side's date was derived from a relative duration ("3 days
// ago") rather than an explicit date, it carries unknown drift - it's
// anchored to whenever the post was viewed/screenshotted, not necessarily
// the real event date. Doubling the cutoff in that case avoids letting a
// likely match get buried just because one side's date is a rough guess.
function compareDateProximity(a, b, ctx) {
  if (!a || !b) return null;
  const diffMs = Math.abs(new Date(a) - new Date(b));
  if (Number.isNaN(diffMs)) return null;
  const diffDays = diffMs / 86400000;
  const cutoff = ctx?.lenient ? DATE_PROXIMITY_CUTOFF_DAYS * 2 : DATE_PROXIMITY_CUTOFF_DAYS;
  return { ratio: Math.max(0, 1 - diffDays / cutoff), diffDays: Math.round(diffDays) };
}

function comparePresence(a, b) {
  const hasA = Array.isArray(a) ? a.length > 0 : !!a;
  const hasB = Array.isArray(b) ? b.length > 0 : !!b;
  return hasA && hasB ? { ratio: 1 } : null;
}

const WEIGHT_PROXIMITY_CUTOFF_KG = 5;

// Same falloff shape as compareDateProximity but for a plain numeric
// distance - currently only used for weightKg. A visual weight guess ("kind
// of big") is common and imprecise on both sides, so this is deliberately a
// soft signal (a modest weight in the default config), not a hard
// disqualifier the way color or species is.
function compareNumericProximity(a, b, ctx) {
  const na = Number(a);
  const nb = Number(b);
  if (!a || !b || Number.isNaN(na) || Number.isNaN(nb)) return null;
  const diff = Math.abs(na - nb);
  const cutoff = ctx?.numericCutoff || WEIGHT_PROXIMITY_CUTOFF_KG;
  return { ratio: Math.max(0, 1 - diff / cutoff), diff };
}

const COMPARATORS = {
  exact: compareExact,
  booleanTrait: compareBooleanTrait,
  exactSkipDefault: compareExactSkipDefault,
  colorMatch: compareColor,
  textOverlap: compareTextOverlap,
  markList: compareMarkList,
  dateProximity: compareDateProximity,
  numericProximity: compareNumericProximity,
  presence: comparePresence,
};

// Weights sum to 100 (aside from mismatch penalties, which subtract on top).
// "specialMarks" reuses the existing free-text markings field - a blind eye
// or a missing leg is close to a unique identifier, so it's weighted well
// above generic color/size.
export const DEFAULT_MATCH_CONFIG = {
  // Score relative to the weight of fields both sides actually filled in,
  // rather than out of the full 100 regardless of how sparse the records
  // are. A found report is often filed by a stranger who knows almost
  // nothing about the cat beyond a photo, so most matches will only ever
  // have a handful of fields to compare - this keeps a strong match on
  // those few fields from being penalized just for having less data than
  // a fully-filled-in pair would.
  relativeScoring: true,
  colorGroups: DEFAULT_COLOR_GROUPS,
  confidenceColors: DEFAULT_CONFIDENCE_COLORS,
  parameters: [
    { key: 'microchip', label: 'מספר שבב', weight: 25, enabled: true, comparisonType: 'exact', lostField: 'microchipNumber', foundField: 'microchipNumber', mismatchPenalty: 20 },
    { key: 'specialMarks', label: 'סימנים מיוחדים', weight: 20, enabled: true, comparisonType: 'markList', lostField: 'markings', foundField: 'markings' },
    { key: 'clippedEar', label: 'אוזן קטומה (סימון עיקור)', weight: 10, enabled: true, comparisonType: 'booleanTrait', lostField: 'hasClippedEar', foundField: 'hasClippedEar', mismatchPenalty: 10, disqualifying: true },
    { key: 'dateProximity', label: 'קרבת תאריכים', weight: 15, enabled: true, comparisonType: 'dateProximity', lostField: 'lastSeenDate', foundField: 'seenDate' },
    { key: 'color', label: 'צבע', weight: 15, enabled: true, comparisonType: 'colorMatch', lostField: 'color', foundField: 'color', disqualifying: true },
    { key: 'ageClass', label: 'גור/מבוגר', weight: 10, enabled: true, comparisonType: 'exact', lostField: 'ageClass', foundField: 'ageClass', mismatchPenalty: 10 },
    { key: 'furType', label: 'סוג פרווה', weight: 10, enabled: true, comparisonType: 'exactSkipDefault', lostField: 'furType', foundField: 'furType', mismatchPenalty: 10, defaultValue: 'short' },
    { key: 'pattern', label: 'תבנית פרווה (חתולים)', weight: 10, enabled: true, comparisonType: 'exactSkipDefault', lostField: 'pattern', foundField: 'pattern', mismatchPenalty: 10, defaultValue: 'אחיד' },
    { key: 'city', label: 'עיר', weight: 10, enabled: true, comparisonType: 'textOverlap', lostField: 'city', foundField: 'city' },
    { key: 'hasCollar', label: 'קולר/רתמה', weight: 5, enabled: true, comparisonType: 'exact', lostField: 'hasCollar', foundField: 'hasCollar', mismatchPenalty: 5 },
    { key: 'collarColor', label: 'צבע הקולר', weight: 5, enabled: true, comparisonType: 'exact', lostField: 'collarColor', foundField: 'collarColor' },
    { key: 'collarBell', label: 'פעמון על הקולר', weight: 5, enabled: true, comparisonType: 'exact', lostField: 'collarHasBell', foundField: 'collarHasBell' },
    { key: 'neighborhood', label: 'שכונה', weight: 5, enabled: true, comparisonType: 'textOverlap', lostField: 'neighborhood', foundField: 'neighborhood' },
    { key: 'size', label: 'גודל', weight: 5, enabled: true, comparisonType: 'exact', lostField: 'size', foundField: 'size' },
    { key: 'weight', label: 'משקל', weight: 5, enabled: true, comparisonType: 'numericProximity', lostField: 'weightKg', foundField: 'weightKg' },
    { key: 'remarks', label: 'הערות נוספות', weight: 5, enabled: true, comparisonType: 'textOverlap', lostField: 'notes', foundField: 'notes' },
    { key: 'hasPhoto', label: 'קיימת תמונה בשני הצדדים', weight: 5, enabled: true, comparisonType: 'presence', lostField: 'photos', foundField: 'photos' },
  ],
};

/**
 * Fields a settings-panel user can pick from when adding a new parameter,
 * without needing a field they haven't heard of. Kept in sync by hand with
 * what the lost-case/found-report forms actually capture.
 */
export const COMPARABLE_FIELDS = [
  { field: 'markings', label: 'סימנים מיוחדים' },
  { field: 'color', label: 'צבע' },
  { field: 'pattern', label: 'תבנית פרווה (חתולים)' },
  { field: 'breed', label: 'גזע' },
  { field: 'size', label: 'גודל' },
  { field: 'ageClass', label: 'גור/מבוגר' },
  { field: 'furType', label: 'סוג פרווה' },
  { field: 'hasCollar', label: 'קולר/רתמה (יש/אין)' },
  { field: 'hasClippedEar', label: 'אוזן קטומה (סימון עיקור)' },
  { field: 'collarColor', label: 'צבע הקולר' },
  { field: 'collarHasBell', label: 'פעמון על הקולר' },
  { field: 'city', label: 'עיר' },
  { field: 'neighborhood', label: 'שכונה' },
  { field: 'notes', label: 'הערות נוספות' },
  { field: 'photos', label: 'תמונה (קיימת/לא קיימת)' },
  { field: 'lastSeenDate', label: 'תאריך מדויק - תיק חיפוש' },
  { field: 'seenDate', label: 'תאריך מדויק - דיווח' },
  { field: 'weightKg', label: 'משקל' },
  { field: 'microchipNumber', label: 'מספר שבב' },
];

export const COMPARISON_TYPE_LABELS = {
  exact: 'התאמה מדויקת',
  booleanTrait: 'סימן נדיר (קיים/לא קיים - "לא קיים" משני הצדדים לא נחשב כהתאמה)',
  exactSkipDefault: 'התאמה מדויקת, מלבד ערך ברירת מחדל (התאמה על הערך הנפוץ/הרגיל לא נחשבת)',
  colorMatch: 'צבע (מבדיל צבע אחיד ממנומר/רב-גוני, סולח על זוגות שקל לבלבל בתאורה כמו לבן/אפור)',
  textOverlap: 'חפיפת מילים בטקסט חופשי',
  markList: 'רשימת סימנים (כל סימן מול הסימן הכי דומה לו בצד השני)',
  dateProximity: 'קרבה בזמן (דורש שדה תאריך אמיתי)',
  numericProximity: 'קרבה במספר (למשל משקל)',
  presence: 'קיים משני הצדדים',
};

export function fieldLabel(field) {
  return COMPARABLE_FIELDS.find((f) => f.field === field)?.label || field;
}

/**
 * Scores one lost case against one found/seen report using the given rule
 * config (defaults to DEFAULT_MATCH_CONFIG). Returns { score: 0-100,
 * reasons: string[], breakdown } where reasons explain every component that
 * moved the score, positive or negative (skipped for anyone just glancing
 * at a match card), and breakdown lists literally every enabled parameter -
 * including ones skipped for missing data - so the "full analysis" view can
 * show the complete picture of what the algorithm did and didn't check.
 */
export function scoreMatch(lostCase, foundReport, config = DEFAULT_MATCH_CONFIG) {
  // A cat and a dog are never the same animal - checked unconditionally,
  // before anything else and outside the configurable parameter list, since
  // nothing about matching should ever be able to turn this off. A record
  // from before species tracking existed has no species value at all, so
  // this only disqualifies when both sides actually say something and
  // disagree, never on missing data.
  if (lostCase.species && foundReport.species && lostCase.species !== foundReport.species) {
    return { score: 0, reasons: ['סוג חיה שונה (חתול/כלב) - פוסל התאמה'], breakdown: [] };
  }

  const reasons = [];
  const breakdown = [];
  let earned = 0;
  let comparableWeight = 0;
  let disqualified = false;

  for (const p of config.parameters) {
    if (!p.enabled) continue;
    const compare = COMPARATORS[p.comparisonType];
    if (!compare) continue;

    // Every breakdown entry carries the actual values being compared, not
    // just the verdict - "color: mismatch" alone doesn't tell you if it was
    // orange-vs-gray or orange-vs-orange-white, and seeing the real values
    // is exactly what's needed to judge whether the algorithm (or the
    // underlying data) is what's actually wrong. Firestore rejects an
    // explicit `undefined` field outright (the whole write throws, silently
    // leaving old data in place) - a field that was never set on an older
    // record is undefined, not "", so this can't just assume the empty-
    // string default every other field here already has. A raw photos
    // array is also stored as a plain boolean instead of the real array -
    // no need to duplicate every photo URL into every match's breakdown.
    const displayValue = (v) => (Array.isArray(v) ? v.length > 0 : (v ?? null));
    const lostValue = displayValue(lostCase[p.lostField]);
    const foundValue = displayValue(foundReport[p.foundField]);
    const push = (fields) => breakdown.push({ label: p.label, weight: p.weight, lostValue, foundValue, ...fields });

    const lenient =
      p.comparisonType === 'dateProximity' &&
      !!(lostCase[`${p.lostField}Approx`] || foundReport[`${p.foundField}Approx`]);
    const ctx = { lenient, colorGroups: config.colorGroups, defaultValue: p.defaultValue };
    const result = compare(lostValue, foundValue, ctx);
    if (!result) {
      push({ contribution: 0, verdict: 'skipped', detail: 'חסר מידע באחד הצדדים או בשניהם - לא נבדק' });
      continue;
    }

    comparableWeight += p.weight;

    if (
      p.comparisonType === 'exact' ||
      p.comparisonType === 'booleanTrait' ||
      p.comparisonType === 'exactSkipDefault' ||
      p.comparisonType === 'colorMatch'
    ) {
      if (result.ratio === 1) {
        earned += p.weight;
        reasons.push(`${p.label}: תואם`);
        push({ contribution: p.weight, verdict: 'match', detail: 'תואם' });
      } else if (result.ratio > 0) {
        // Only colorMatch produces this: a lighting-confusable pair (e.g.
        // white vs. gray) isn't a real disagreement, so it earns partial
        // credit instead of triggering a mismatch penalty/disqualification.
        const points = result.ratio * p.weight;
        earned += points;
        const detail = 'התאמה חלקית (יתכן הבדל עקב תאורת הצילום)';
        reasons.push(`${p.label}: ${detail}`);
        push({ contribution: points, verdict: 'partial', detail });
      } else if (p.disqualifying) {
        // A hard mismatch on a defining trait (e.g. color, or a permanent
        // marking like a clipped ear) - this isn't just "less similar," it
        // rules the pair out entirely. Score drops to 0 but the pair still
        // shows up in the ranked list (never fully filtered out), so a
        // wrongly-classified field doesn't hide a real match from the owner.
        disqualified = true;
        const detail = 'אינו תואם - פוסל התאמה';
        reasons.unshift(`${p.label}: ${detail}`);
        push({ contribution: 0, verdict: 'disqualifying', detail });
      } else if (p.mismatchPenalty) {
        earned -= p.mismatchPenalty;
        const detail = 'אינו תואם';
        reasons.push(`${p.label}: ${detail}`);
        push({ contribution: -p.mismatchPenalty, verdict: 'mismatch', detail });
      } else {
        push({ contribution: 0, verdict: 'mismatch', detail: 'אינו תואם' });
      }
    } else if (p.comparisonType === 'presence') {
      earned += p.weight;
      reasons.push(`${p.label}: קיימת משני הצדדים`);
      push({ contribution: p.weight, verdict: 'match', detail: 'קיימת משני הצדדים' });
    } else {
      const points = result.ratio * p.weight;
      const detail =
        p.comparisonType === 'dateProximity'
          ? `הפרש של כ-${result.diffDays} ימים${lenient ? ' (תאריך משוער בצד אחד, ההשוואה גמישה יותר)' : ''}`
          : p.comparisonType === 'numericProximity'
            ? `הפרש של כ-${result.diff}`
            : `התאמה של כ-${Math.round(result.ratio * 100)}%`;
      if (points > 0.01) {
        earned += points;
        reasons.push(`${p.label}: ${detail}`);
        push({ contribution: points, verdict: 'partial', detail });
      } else {
        push({ contribution: 0, verdict: 'no_overlap', detail: 'אין חפיפה משמעותית' });
      }
    }
  }

  if (comparableWeight === 0) {
    return { score: 0, reasons: ['אין מספיק מידע משותף להשוואה'], breakdown };
  }

  if (disqualified) {
    return { score: 0, reasons, breakdown };
  }

  const rawScore = config.relativeScoring ? (earned / comparableWeight) * 100 : earned;
  return { score: Math.max(0, Math.min(100, Math.round(rawScore))), reasons, breakdown };
}

export function rankMatches(lostCase, foundReports, config = DEFAULT_MATCH_CONFIG) {
  return foundReports
    .map((report) => ({ report, ...scoreMatch(lostCase, report, config) }))
    .sort((a, b) => b.score - a.score);
}
