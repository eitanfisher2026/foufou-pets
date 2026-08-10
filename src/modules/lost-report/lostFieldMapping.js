export const EMPTY_LOST_FIELDS = {
  name: '',
  color: '',
  colorDescription: '',
  size: '',
  ageClass: '',
  furType: '',
  hasFluffyTail: false,
  markings: '',
  hasCollar: false,
  collarColor: '',
  collarHasBell: false,
  hasClippedEar: false,
  city: '',
  neighborhood: '',
  lastSeenLocation: '',
  lastSeenAt: '',
  lastSeenDate: '',
  lastSeenDateApprox: false,
  contactName: '',
  contactPhone: '',
  notes: '',
  // A lost-cat post can rely on the Facebook poster's name/group just as
  // much as a found post can - no phone number in the caption means this
  // is the only way back to whoever's actually looking for the cat, same
  // reasoning as the found-report source fields.
  sourceGroupName: '',
  originalPosterName: '',
  sharedByName: '',
  postAgeText: '',
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
 */
export function mergeExtractedLostFields(extracted, prev = EMPTY_LOST_FIELDS) {
  return {
    ...prev,
    name: extracted.petName || prev.name,
    color: extracted.color || prev.color,
    colorDescription: extracted.colorDescription || prev.colorDescription,
    size: extracted.size || prev.size,
    ageClass: extracted.ageClass || prev.ageClass,
    furType: extracted.furType || prev.furType,
    hasFluffyTail: extracted.hasFluffyTail ?? prev.hasFluffyTail,
    markings: extracted.markings || prev.markings,
    hasCollar: extracted.hasCollar ?? prev.hasCollar,
    collarColor: extracted.collarColor || prev.collarColor,
    collarHasBell: extracted.collarHasBell ?? prev.collarHasBell,
    hasClippedEar: extracted.hasClippedEar ?? prev.hasClippedEar,
    city: extracted.city || prev.city,
    neighborhood: extracted.neighborhood || prev.neighborhood,
    lastSeenLocation: extracted.location || prev.lastSeenLocation,
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
 * A nameless lost cat (the common case - most posts never give a street cat
 * a name) shouldn't just read "חתול ללא שם" everywhere when there's a
 * perfectly good description to show instead - same fallback idea as found
 * reports falling back from title to colorDescription.
 */
export function displayLostCaseName(lostCase) {
  return lostCase?.name || shortSnippet(lostCase?.colorDescription) || shortSnippet(lostCase?.markings) || 'חתול ללא שם';
}
