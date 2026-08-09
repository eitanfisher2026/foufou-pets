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
function compareDateProximity(a, b, lenient) {
  if (!a || !b) return null;
  const diffMs = Math.abs(new Date(a) - new Date(b));
  if (Number.isNaN(diffMs)) return null;
  const diffDays = diffMs / 86400000;
  const cutoff = lenient ? DATE_PROXIMITY_CUTOFF_DAYS * 2 : DATE_PROXIMITY_CUTOFF_DAYS;
  return { ratio: Math.max(0, 1 - diffDays / cutoff), diffDays: Math.round(diffDays) };
}

function comparePresence(a, b) {
  const hasA = Array.isArray(a) ? a.length > 0 : !!a;
  const hasB = Array.isArray(b) ? b.length > 0 : !!b;
  return hasA && hasB ? { ratio: 1 } : null;
}

const COMPARATORS = {
  exact: compareExact,
  textOverlap: compareTextOverlap,
  markList: compareMarkList,
  dateProximity: compareDateProximity,
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
  parameters: [
    { key: 'specialMarks', label: 'סימנים מיוחדים', weight: 20, enabled: true, comparisonType: 'markList', lostField: 'markings', foundField: 'markings' },
    { key: 'clippedEar', label: 'אוזן קטומה (סימון עיקור)', weight: 10, enabled: true, comparisonType: 'exact', lostField: 'hasClippedEar', foundField: 'hasClippedEar', mismatchPenalty: 10 },
    { key: 'dateProximity', label: 'קרבת תאריכים', weight: 15, enabled: true, comparisonType: 'dateProximity', lostField: 'lastSeenDate', foundField: 'seenDate' },
    { key: 'color', label: 'צבע', weight: 15, enabled: true, comparisonType: 'exact', lostField: 'color', foundField: 'color' },
    { key: 'ageClass', label: 'גור/מבוגר', weight: 10, enabled: true, comparisonType: 'exact', lostField: 'ageClass', foundField: 'ageClass', mismatchPenalty: 10 },
    { key: 'city', label: 'עיר', weight: 10, enabled: true, comparisonType: 'textOverlap', lostField: 'city', foundField: 'city' },
    { key: 'hasCollar', label: 'קולר/רתמה', weight: 5, enabled: true, comparisonType: 'exact', lostField: 'hasCollar', foundField: 'hasCollar', mismatchPenalty: 5 },
    { key: 'collarColor', label: 'צבע הקולר', weight: 5, enabled: true, comparisonType: 'exact', lostField: 'collarColor', foundField: 'collarColor' },
    { key: 'collarBell', label: 'פעמון על הקולר', weight: 5, enabled: true, comparisonType: 'exact', lostField: 'collarHasBell', foundField: 'collarHasBell' },
    { key: 'neighborhood', label: 'שכונה', weight: 5, enabled: true, comparisonType: 'textOverlap', lostField: 'neighborhood', foundField: 'neighborhood' },
    { key: 'size', label: 'גודל', weight: 5, enabled: true, comparisonType: 'exact', lostField: 'size', foundField: 'size' },
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
  { field: 'size', label: 'גודל' },
  { field: 'ageClass', label: 'גור/מבוגר' },
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
];

export const COMPARISON_TYPE_LABELS = {
  exact: 'התאמה מדויקת',
  textOverlap: 'חפיפת מילים בטקסט חופשי',
  markList: 'רשימת סימנים (כל סימן מול הסימן הכי דומה לו בצד השני)',
  dateProximity: 'קרבה בזמן (דורש שדה תאריך אמיתי)',
  presence: 'קיים משני הצדדים',
};

export function fieldLabel(field) {
  return COMPARABLE_FIELDS.find((f) => f.field === field)?.label || field;
}

/**
 * Scores one lost case against one found/seen report using the given rule
 * config (defaults to DEFAULT_MATCH_CONFIG). Returns { score: 0-100,
 * reasons: string[] } where reasons explain every component that moved the
 * score, positive or negative.
 */
export function scoreMatch(lostCase, foundReport, config = DEFAULT_MATCH_CONFIG) {
  const reasons = [];
  let earned = 0;
  let comparableWeight = 0;

  for (const p of config.parameters) {
    if (!p.enabled) continue;
    const compare = COMPARATORS[p.comparisonType];
    if (!compare) continue;

    const lenient =
      p.comparisonType === 'dateProximity' &&
      !!(lostCase[`${p.lostField}Approx`] || foundReport[`${p.foundField}Approx`]);
    const result = compare(lostCase[p.lostField], foundReport[p.foundField], lenient);
    if (!result) continue;

    comparableWeight += p.weight;

    if (p.comparisonType === 'exact') {
      if (result.ratio === 1) {
        earned += p.weight;
        reasons.push(`${p.label}: תואם`);
      } else if (p.mismatchPenalty) {
        earned -= p.mismatchPenalty;
        reasons.push(`${p.label}: אינו תואם`);
      }
    } else if (p.comparisonType === 'presence') {
      earned += p.weight;
      reasons.push(`${p.label}: קיימת משני הצדדים`);
    } else {
      const points = result.ratio * p.weight;
      if (points > 0.01) {
        earned += points;
        const detail =
          p.comparisonType === 'dateProximity'
            ? `הפרש של כ-${result.diffDays} ימים${lenient ? ' (תאריך משוער בצד אחד, ההשוואה גמישה יותר)' : ''}`
            : `התאמה של כ-${Math.round(result.ratio * 100)}%`;
        reasons.push(`${p.label}: ${detail}`);
      }
    }
  }

  if (comparableWeight === 0) {
    return { score: 0, reasons: ['אין מספיק מידע משותף להשוואה'] };
  }

  const rawScore = config.relativeScoring ? (earned / comparableWeight) * 100 : earned;
  return { score: Math.max(0, Math.min(100, Math.round(rawScore))), reasons };
}

export function rankMatches(lostCase, foundReports, config = DEFAULT_MATCH_CONFIG) {
  return foundReports
    .map((report) => ({ report, ...scoreMatch(lostCase, report, config) }))
    .sort((a, b) => b.score - a.score);
}
