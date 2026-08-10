export const EMPTY_LOST_FIELDS = {
  name: '',
  color: '',
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
  };
}
