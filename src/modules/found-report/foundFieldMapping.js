import { appendLine, appendDetail } from '../shared/textMerge.js';

export const EMPTY_FOUND_FIELDS = {
  title: '',
  color: '',
  breed: '',
  size: '',
  ageClass: '',
  furType: '',
  markings: '',
  hasCollar: null,
  collarColor: '',
  collarHasBell: null,
  hasClippedEar: null,
  city: '',
  neighborhood: '',
  dateText: '',
  seenDate: '',
  seenDateApprox: false,
  condition: 'seen_only',
  contactName: '',
  contactPhone: '',
  notes: '',
  sourceGroupName: '',
  originalPosterName: '',
  sharedByName: '',
  postAgeText: '',
  // Cumulative real cost of every AI extraction call made for this report
  // (initial upload plus any re-scans).
  aiCostUsd: 0,
};

/**
 * Maps one AI extraction result onto found-report fields, filling in over
 * whatever's already there (prev) rather than overwriting blindly - shared
 * between the found-report form's own upload and the unified "add a cat"
 * intake, so there's exactly one place that knows how an extraction result
 * becomes a found report.
 *
 * colorDescription, hasFluffyTail, and location aren't fields of their own
 * here - the AI still extracts them (they're useful signal), but they fold
 * straight into markings/neighborhood instead of needing their own form
 * field, mirroring how a person filling this in by hand would just
 * describe a fluffy tail or a specific street corner as another line of
 * "special markings" or "neighborhood", not a separate box.
 */
export function mergeExtractedFoundFields(extracted, prev = EMPTY_FOUND_FIELDS) {
  let markings = extracted.markings || prev.markings;
  markings = appendLine(markings, extracted.colorDescription);
  if (extracted.hasFluffyTail) markings = appendLine(markings, 'זנב שעיר/פלומתי במיוחד');

  return {
    ...prev,
    // Only falls back when the title is still blank - never overwrites a
    // title someone already typed. A found cat can still have a known name
    // (e.g. a post that names the cat, or a chip/tag the finder read) -
    // petName is worth more than a generic color description when present.
    title: prev.title || extracted.petName || extracted.colorDescription,
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
    condition: extracted.condition || prev.condition,
    dateText: extracted.dateText || prev.dateText,
    seenDate: extracted.computedDate || prev.seenDate,
    seenDateApprox: extracted.computedDateApprox ?? prev.seenDateApprox,
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
