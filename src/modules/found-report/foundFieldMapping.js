import { appendLine, appendDetail } from '../shared/textMerge.js';
import { shortSnippet } from '../shared/textSnippet.js';
import { SPECIES } from '../shared/collections.js';
import { petLabels } from '../shared/petLabels.js';

export const EMPTY_FOUND_FIELDS = {
  // Defaults to cat (the only species this app supported until now) - a
  // create form always overwrites this with whatever the person actually
  // picked/the AI detected before saving.
  species: SPECIES.CAT,
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
  // The Facebook post's own link, when known (pasted by hand or pulled
  // automatically via the link-preview fetch) - kept as a plain URL so
  // anyone reviewing the report can jump straight to the original post.
  sourceUrl: '',
  // Dog-oriented fields, but not species-gated - a chip or a known weight
  // is useful identifying info for a cat too, it's just far more commonly
  // known/asked-about for dogs.
  weightKg: '',
  microchipNumber: '',
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
    weightKg: extracted.weightKg || prev.weightKg,
    microchipNumber: extracted.microchipNumber || prev.microchipNumber,
    aiCostUsd: (prev.aiCostUsd || 0) + (extracted._aiUsage?.estimatedCostUsd || 0),
  };
}

/**
 * A found report with no title (the common case for a bare screenshot with
 * no caption at all) shouldn't just read a generic fallback when there's a
 * perfectly good description to show instead - same reasoning and same
 * snippet helper as displayLostCaseName, so an unnamed animal on either
 * side gets the same kind of fallback.
 */
export function displayFoundReportName(report) {
  return report?.title || shortSnippet(report?.markings) || petLabels(report?.species).animal;
}
