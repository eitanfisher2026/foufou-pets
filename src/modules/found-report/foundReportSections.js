import { CAT_SIZES, CAT_AGE_CLASSES, CAT_FUR_TYPES, CAT_CONDITIONS } from '../shared/collections.js';
import { formatDate } from '../shared/formatDate.js';

/**
 * Builds the same [{ title, rows }] sections RecordDetailsDialog expects,
 * for a found report - shared between the report's own "פרטים מלאים" view
 * and the "פרטי חתול" dialog opened from a match card during match review,
 * so both show literally the same fields in the same order rather than two
 * hand-maintained copies drifting apart.
 */
export function buildFoundReportSections(report) {
  return [
    {
      title: 'פרטי חתול',
      rows: [
        { label: 'כותרת', value: report.title },
        { label: 'מצב החתול', value: CAT_CONDITIONS.find((c) => c.value === report.condition)?.label },
        { label: 'צבע', value: report.color },
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
        { label: 'גזע', value: report.breed },
        { label: 'סוג פרווה', value: CAT_FUR_TYPES.find((f) => f.value === report.furType)?.label },
        { label: 'גודל', value: CAT_SIZES.find((s) => s.value === report.size)?.label },
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
      ],
    },
  ];
}
