export const EMPTY_FOUND_FIELDS = {
  title: '',
  color: '',
  colorDescription: '',
  size: '',
  ageClass: '',
  furType: '',
  hasFluffyTail: null,
  markings: '',
  hasCollar: null,
  collarColor: '',
  collarHasBell: null,
  hasClippedEar: null,
  city: '',
  neighborhood: '',
  location: '',
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
 */
export function mergeExtractedFoundFields(extracted, prev = EMPTY_FOUND_FIELDS) {
  return {
    ...prev,
    // Only falls back to colorDescription when the title is still blank -
    // never overwrites a title someone already typed.
    title: prev.title || extracted.colorDescription || prev.title,
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
    location: extracted.location || prev.location,
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
