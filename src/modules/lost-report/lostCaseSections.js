import {
  CAT_SIZES,
  CAT_AGE_CLASSES,
  CAT_FUR_TYPES,
  DOG_FUR_TYPES,
  SPECIES,
  CLOSURE_REASON_LABELS,
} from '../shared/collections.js';
import { formatDate } from '../shared/formatDate.js';
import { formatDateTime } from '../shared/formatDateTime.js';
import { petLabels } from '../shared/petLabels.js';
import { displayLostCaseName } from './lostFieldMapping.js';

/**
 * Builds the same [{ title, rows }] sections RecordDetailsDialog expects,
 * for a lost case - shared between the case's own "פרטים מלאים" view and
 * the duplicate-warning dialog shown before creating a new record (see
 * duplicateCheckApi.js/DuplicateWarningDialog.jsx), so both show literally
 * the same fields in the same order rather than two hand-maintained copies
 * drifting apart.
 */
export function buildLostCaseSections(lostCase) {
  const labels = petLabels(lostCase.species);
  return [
    {
      title: labels.petDetailsSection,
      rows: [
        { label: 'שם', value: displayLostCaseName(lostCase) },
        { label: labels.breedLabel, value: lostCase.breed },
        { label: 'צבע', value: lostCase.color },
        { label: 'תבנית פרווה', value: lostCase.pattern },
        { label: 'גור/מבוגר', value: CAT_AGE_CLASSES.find((a) => a.value === lostCase.ageClass)?.label },
        { label: 'קולר/רתמה', value: lostCase.hasCollar === true ? 'כן' : lostCase.hasCollar === false ? 'לא' : '' },
        { label: 'צבע הקולר', value: lostCase.collarColor },
        {
          label: 'פעמון על הקולר',
          value: lostCase.collarHasBell === true ? 'כן' : lostCase.collarHasBell === false ? 'לא' : '',
        },
        {
          label: 'אוזן קטומה',
          value: lostCase.hasClippedEar === true ? 'כן' : lostCase.hasClippedEar === false ? 'לא' : '',
        },
        { label: 'סימנים מיוחדים', value: lostCase.markings },
        {
          label: labels.furTypeLabel,
          value: (lostCase.species === SPECIES.DOG ? DOG_FUR_TYPES : CAT_FUR_TYPES).find((f) => f.value === lostCase.furType)
            ?.label,
        },
        { label: 'גודל', value: CAT_SIZES.find((s) => s.value === lostCase.size)?.label },
        { label: 'משקל (ק״ג)', value: lostCase.weightKg },
        { label: 'מספר שבב', value: lostCase.microchipNumber },
      ],
    },
    {
      title: 'נראה לאחרונה',
      rows: [
        { label: 'עיר', value: lostCase.city },
        { label: 'שכונה', value: lostCase.neighborhood },
        { label: 'מועד האובדן', value: lostCase.lastSeenAt },
        {
          label: 'תאריך מדויק',
          value: lostCase.lastSeenDate
            ? `${formatDate(lostCase.lastSeenDate)}${lostCase.lastSeenDateApprox ? ' (משוער)' : ''}`
            : '',
          dir: 'ltr',
        },
      ],
    },
    {
      title: 'פרטי קשר',
      rows: [
        { label: 'שם איש קשר', value: lostCase.contactName },
        { label: 'טלפון', value: lostCase.contactPhone },
        { label: 'הערות נוספות', value: lostCase.notes },
      ],
    },
    {
      title: 'סגירת התיק',
      rows: [
        { label: 'סטטוס סגירה', value: CLOSURE_REASON_LABELS[lostCase.closureReason] || '' },
        { label: 'תאריך', value: lostCase.closureDate ? formatDate(lostCase.closureDate) : '', dir: 'ltr' },
        { label: 'ע״י', value: lostCase.closedBy },
        { label: 'הערה', value: lostCase.closingComment },
      ],
    },
    {
      title: 'מקור מידע',
      startClosed: true,
      keepIfEmpty: true,
      rows: [
        { label: 'מקור המידע (קבוצה)', value: lostCase.sourceGroupName },
        { label: 'מי כתב את הפוסט', value: lostCase.originalPosterName },
        { label: 'מי שיתף', value: lostCase.sharedByName },
        { label: 'מתי פורסם', value: lostCase.postAgeText },
        { label: 'קישור לפוסט המקורי', value: lostCase.sourceUrl },
      ],
    },
    {
      title: 'פרטי רשומה',
      startClosed: true,
      rows: [
        { label: 'מספר רשומה', value: lostCase.recordNumber, dir: 'ltr' },
        // No ownerId fallback - a raw account ID means nothing to a person
        // reading this; if the name/email snapshot is missing (see
        // createLostCase), better to just hide the row than show a
        // technical ID.
        { label: 'נוצר/ה על ידי', value: lostCase.ownerName || lostCase.ownerEmail || '' },
        { label: 'תאריך יצירה', value: formatDateTime(lostCase.createdAt), dir: 'ltr' },
        { label: 'עדכון אחרון', value: formatDateTime(lostCase.updatedAt), dir: 'ltr' },
      ],
    },
  ];
}
