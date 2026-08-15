import {
  CAT_SIZES,
  CAT_AGE_CLASSES,
  CAT_FUR_TYPES,
  DOG_FUR_TYPES,
  CAT_CONDITIONS,
  SPECIES,
  SPECIES_LABELS,
} from '../shared/collections.js';
import { formatDate } from '../shared/formatDate.js';
import { formatDateTime } from '../shared/formatDateTime.js';
import { petLabels } from '../shared/petLabels.js';
import { displayFoundReportName } from './foundFieldMapping.js';

/**
 * Builds the same [{ title, rows }] sections RecordDetailsDialog expects,
 * for a found report - shared between the report's own "פרטים מלאים" view
 * and the "פרטי חתול/כלב" dialog opened from a match card during match
 * review, so both show literally the same fields in the same order rather
 * than two hand-maintained copies drifting apart.
 */
export function buildFoundReportSections(report) {
  const labels = petLabels(report.species);
  return [
    {
      title: labels.petDetailsSection,
      rows: [
        { label: 'שם', value: displayFoundReportName(report) },
        { label: 'מין', value: SPECIES_LABELS[report.species] },
        { label: labels.conditionLabel, value: CAT_CONDITIONS.find((c) => c.value === report.condition)?.label },
        { label: 'צבע', value: report.color },
        { label: 'תבנית פרווה', value: report.pattern },
        { label: 'גור/מבוגר', value: CAT_AGE_CLASSES.find((a) => a.value === report.ageClass)?.label },
        { label: 'קולר/רתמה', value: report.hasCollar === true ? 'כן' : report.hasCollar === false ? 'לא' : '' },
        { label: 'צבע הקולר', value: report.collarColor },
        {
          label: 'פעמון על הקולר',
          value: report.collarHasBell === true ? 'כן' : report.collarHasBell === false ? 'לא' : '',
        },
        {
          label: 'אוזן קטומה',
          value: report.hasClippedEar === true ? 'כן' : report.hasClippedEar === false ? 'לא' : '',
        },
        { label: 'סימנים מיוחדים', value: report.markings },
        { label: labels.breedLabel, value: report.breed },
        {
          label: labels.furTypeLabel,
          value: (report.species === SPECIES.DOG ? DOG_FUR_TYPES : CAT_FUR_TYPES).find((f) => f.value === report.furType)?.label,
        },
        { label: 'גודל', value: CAT_SIZES.find((s) => s.value === report.size)?.label },
        { label: 'משקל (ק״ג)', value: report.weightKg },
        { label: 'מספר שבב', value: report.microchipNumber },
      ],
    },
    {
      title: 'נראה לאחרונה',
      rows: [
        { label: 'עיר', value: report.city },
        { label: 'שכונה', value: report.neighborhood },
        { label: 'מועד הראייה/המציאה', value: report.dateText },
        {
          label: 'תאריך מדויק',
          value: report.seenDate ? `${formatDate(report.seenDate)}${report.seenDateApprox ? ' (משוער)' : ''}` : '',
          dir: 'ltr',
        },
      ],
    },
    {
      title: 'פרטי קשר',
      rows: [
        { label: 'שם איש קשר', value: report.contactName },
        { label: 'טלפון', value: report.contactPhone },
        { label: 'הערות נוספות', value: report.notes },
      ],
    },
    {
      title: 'מקור מידע',
      rows: [
        { label: 'מקור המידע (קבוצה)', value: report.sourceGroupName },
        { label: 'מי כתב את הפוסט', value: report.originalPosterName },
        { label: 'מי שיתף', value: report.sharedByName },
        { label: 'מתי פורסם', value: report.postAgeText },
        { label: 'קישור לפוסט המקורי', value: report.sourceUrl },
      ],
    },
    {
      title: 'פרטי רשומה',
      startClosed: true,
      rows: [
        // No reportedByUid fallback - a raw account ID means nothing to a
        // person reading this; if the name/email snapshot is missing (see
        // createFoundReport), better to just hide the row than show a
        // technical ID.
        { label: 'נוצר/ה על ידי', value: report.reporterName || report.reporterEmail || '' },
        { label: 'תאריך יצירה', value: formatDateTime(report.createdAt), dir: 'ltr' },
        { label: 'עדכון אחרון', value: formatDateTime(report.updatedAt), dir: 'ltr' },
      ],
    },
  ];
}
