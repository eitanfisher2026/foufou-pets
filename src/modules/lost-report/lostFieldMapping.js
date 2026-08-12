import { appendLine, appendDetail } from '../shared/textMerge.js';
import { SPECIES } from '../shared/collections.js';
import { petLabels } from '../shared/petLabels.js';

export const EMPTY_LOST_FIELDS = {
  // Defaults to cat (the only species this app supported until now) - a
  // create form always overwrites this with whatever the person actually
  // picked/the AI detected before saving.
  species: SPECIES.CAT,
  name: '',
  color: '',
  breed: '',
  size: '',
  ageClass: '',
  furType: '',
  markings: '',
  hasCollar: false,
  collarColor: '',
  collarHasBell: false,
  hasClippedEar: false,
  city: '',
  neighborhood: '',
  lastSeenAt: '',
  lastSeenDate: '',
  lastSeenDateApprox: false,
  contactName: '',
  contactPhone: '',
  notes: '',
  // One shared closing record covers every closed-case outcome - a case is
  // only ever closed one way at a time, so there's no need for a separate
  // field set per outcome. closureReason (see CLOSURE_REASON in
  // collections.js) is what actually distinguishes them, independent of
  // RECORD_STATUS. Not filled in automatically - no Facebook post states
  // who physically returned a cat - but capturing "closed by" is the
  // foundation for a future rewards/recognition feature for people who
  // genuinely helped.
  closureDate: '',
  closedBy: '',
  closureReason: '',
  closingComment: '',
  // A lost-cat post can rely on the Facebook poster's name/group just as
  // much as a found post can - no phone number in the caption means this
  // is the only way back to whoever's actually looking for the cat, same
  // reasoning as the found-report source fields.
  sourceGroupName: '',
  originalPosterName: '',
  sharedByName: '',
  postAgeText: '',
  // The Facebook post's own link, when known (pasted by hand or pulled
  // automatically via the link-preview fetch) - kept as a plain URL so
  // anyone reviewing the case can jump straight to the original post.
  sourceUrl: '',
  // Dog-oriented fields, but not species-gated - a chip or a known weight
  // is useful identifying info for a cat too, it's just far more commonly
  // known/asked-about for dogs.
  weightKg: '',
  microchipNumber: '',
  // Cumulative real cost of every AI extraction call made for this case
  // (initial upload plus any re-scans) - see shared/costTracking.js.
  aiCostUsd: 0,
};

/**
 * Maps one AI extraction result onto lost-case fields, filling in over
 * whatever's already there (prev) rather than overwriting blindly - shared
 * between the lost-report form's own upload and the unified "add a cat"
 * intake, so there's exactly one place that knows how an extraction result
 * becomes a lost case.
 *
 * colorDescription, hasFluffyTail, and location aren't fields of their own
 * here - the AI still extracts them (they're useful signal), but they fold
 * straight into markings/neighborhood instead of needing their own form
 * field, mirroring how a person filling this in by hand would just
 * describe a fluffy tail or a specific street corner as another line of
 * "special markings" or "neighborhood", not a separate box.
 */
export function mergeExtractedLostFields(extracted, prev = EMPTY_LOST_FIELDS) {
  let markings = extracted.markings || prev.markings;
  markings = appendLine(markings, extracted.colorDescription);
  if (extracted.hasFluffyTail) markings = appendLine(markings, 'זנב שעיר/פלומתי במיוחד');

  // Only overrides an already-picked species if the previous value was
  // still the default 'cat' with no explicit user choice behind it yet -
  // callers that already have a human-confirmed species (e.g. re-scanning
  // an existing case) pass that in via `prev` and it wins over a fresh
  // guess. See useSmartIntake.js/ShareTargetIntake.jsx for where a
  // confident 'cat'/'dog' extraction skips the human species picker
  // entirely.
  const species = extracted.species === 'cat' || extracted.species === 'dog' ? extracted.species : prev.species;

  return {
    ...prev,
    species,
    name: extracted.petName || prev.name,
    color: extracted.color || prev.color,
    breed: extracted.breed || prev.breed,
    size: extracted.size || prev.size,
    ageClass: extracted.ageClass || prev.ageClass,
    furType: extracted.furType || prev.furType,
    markings,
    hasCollar: extracted.hasCollar ?? prev.hasCollar,
    collarColor: extracted.collarColor || prev.collarColor,
    collarHasBell: extracted.collarHasBell ?? prev.collarHasBell,
    hasClippedEar: extracted.hasClippedEar ?? prev.hasClippedEar,
    city: extracted.city || prev.city,
    neighborhood: appendDetail(extracted.neighborhood || prev.neighborhood, extracted.location),
    lastSeenAt: extracted.dateText || prev.lastSeenAt,
    lastSeenDate: extracted.computedDate || prev.lastSeenDate,
    lastSeenDateApprox: extracted.computedDateApprox ?? prev.lastSeenDateApprox,
    contactName: extracted.contactName || prev.contactName,
    contactPhone: extracted.contactPhone || prev.contactPhone,
    notes: extracted.captionText || prev.notes,
    sourceGroupName: extracted.sourceGroupName || prev.sourceGroupName,
    originalPosterName: extracted.originalPosterName || prev.originalPosterName,
    sharedByName: extracted.sharedByName || prev.sharedByName,
    postAgeText: extracted.postAgeText || prev.postAgeText,
    weightKg: extracted.weightKg || prev.weightKg,
    microchipNumber: extracted.microchipNumber || prev.microchipNumber,
    aiCostUsd: (prev.aiCostUsd || 0) + (extracted._aiUsage?.estimatedCostUsd || 0),
  };
}

const MAX_FALLBACK_NAME_LENGTH = 30;

// markings can be several lines long (one distinct mark per line) - only
// the first line, trimmed to a title-sized snippet, is fit to stand in for
// a name.
function shortSnippet(text) {
  if (!text) return '';
  const firstLine = text.split('\n')[0].trim();
  return firstLine.length > MAX_FALLBACK_NAME_LENGTH
    ? firstLine.slice(0, MAX_FALLBACK_NAME_LENGTH).trim() + '…'
    : firstLine;
}

/**
 * A nameless lost pet (the common case - most posts never give a street
 * animal a name) shouldn't just read a generic fallback everywhere when
 * there's a perfectly good description to show instead.
 */
export function displayLostCaseName(lostCase) {
  return lostCase?.name || shortSnippet(lostCase?.markings) || petLabels(lostCase?.species).noNameFallback;
}
