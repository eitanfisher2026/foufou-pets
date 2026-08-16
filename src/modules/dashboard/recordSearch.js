import { SPECIES, COLLAR_COLORS, CAT_CONDITIONS } from '../shared/collections.js';

/**
 * Declarative list driving SearchDialog.jsx generically for both record
 * types (lost cases and found reports share almost the same field set) -
 * each entry knows its own label and where its options come from, so the
 * dialog is one render loop over this list rather than hand-written JSX
 * per field. Deliberately NOT the same field set as lostCaseSections.js/
 * foundReportSections.js (the "פרטים מלאים" view) - those include plenty
 * that make no sense to filter by (source links, exact microchip lookups),
 * and some rows there are pre-formatted for reading rather than raw
 * filterable values. This is a separate, smaller, curated list of the
 * fields actually worth searching on, using the exact same live option
 * sources the create/edit forms already use (colors/breeds/patterns), so a
 * color someone adds in settings is searchable immediately too.
 *
 * `optionsKey` names which resolved options list to use (see
 * resolveOptions in SearchDialog.jsx, since colors/breeds/patterns/furType
 * come from hooks and can't be listed as plain data here). `options` is
 * for the static lists that don't depend on live config. `type: 'text'`
 * fields do a substring match; `type: 'boolean'` is a tri-state
 * yes/no/either select; `type: 'date'` compares against the record's own
 * createdAt (createdFrom/createdTo bound an inclusive range); anything
 * else is an exact match against a picked option value. `recordTypeOnly`
 * hides a field entirely when it doesn't apply to the record type
 * currently being searched (e.g. "מצב" only makes sense for found
 * reports).
 */
export const SEARCH_FIELDS = [
  { key: 'color', label: 'צבע', optionsKey: 'colorOptions', group: 'traits' },
  { key: 'breed', label: 'גזע', optionsKey: 'breedOptions', group: 'traits' },
  { key: 'pattern', label: 'תבנית פרווה', optionsKey: 'patternOptions', group: 'traits', speciesOnly: SPECIES.CAT },
  { key: 'furType', label: 'סוג פרווה', optionsKey: 'furTypeOptions', group: 'traits' },
  { key: 'size', label: 'גודל', optionsKey: 'sizeOptions', group: 'traits' },
  { key: 'ageClass', label: 'גור/מבוגר', optionsKey: 'ageClassOptions', group: 'traits' },
  { key: 'condition', label: 'מצב', options: CAT_CONDITIONS, group: 'traits', recordTypeOnly: 'found' },
  { key: 'hasCollar', label: 'קולר/רתמה', type: 'boolean', group: 'traits' },
  { key: 'collarColor', label: 'צבע הקולר', options: COLLAR_COLORS, group: 'traits' },
  { key: 'hasClippedEar', label: 'אוזן קטומה (סימון עיקור)', type: 'boolean', group: 'traits', speciesOnly: SPECIES.CAT },
  { key: 'city', label: 'עיר', type: 'text', group: 'location' },
  { key: 'neighborhood', label: 'שכונה', type: 'text', group: 'location' },
  { key: 'keyword', label: 'מילת חיפוש (שם / סימנים / הערות)', type: 'text', group: 'location' },
  { key: 'contactName', label: 'שם איש קשר', type: 'text', group: 'contact' },
  { key: 'contactPhone', label: 'טלפון', type: 'text', group: 'contact' },
  { key: 'recordNumber', label: 'מספר רשומה', type: 'text', group: 'identifiers' },
  { key: 'createdBy', label: 'נוצר על ידי (שם חלקי)', type: 'text', group: 'identifiers' },
  { key: 'createdFrom', label: 'נוצר מתאריך', type: 'date', group: 'identifiers' },
  { key: 'createdTo', label: 'נוצר עד תאריך', type: 'date', group: 'identifiers' },
];

export const SEARCH_FIELD_GROUPS = [
  { key: 'traits', title: 'מאפייני החיה' },
  { key: 'location', title: 'מיקום וטקסט חופשי' },
  { key: 'contact', title: 'פרטי קשר' },
  { key: 'identifiers', title: 'זיהוי' },
];

function normalize(text) {
  return (text || '').toString().trim().toLowerCase();
}

/**
 * True if a lost case or found report matches every non-empty criterion -
 * an empty/unset value for a field means "don't filter on this", not "must
 * be empty". Works for both record types unchanged: a field that doesn't
 * exist on one type (e.g. "condition" on a lost case) is simply undefined
 * there, which only ever matters if that field was actually searched on -
 * and it's only ever searchable in the dialog for the type it applies to
 * (see recordTypeOnly in SEARCH_FIELDS), so this never needs to know which
 * type `record` is.
 */
export function matchesSearch(record, criteria) {
  for (const field of SEARCH_FIELDS) {
    const value = criteria[field.key];
    if (value === undefined || value === '') continue;

    if (field.type === 'text') {
      if (field.key === 'keyword') {
        const haystack = normalize(`${record.name || ''} ${record.title || ''} ${record.markings || ''} ${record.notes || ''}`);
        if (!haystack.includes(normalize(value))) return false;
      } else if (field.key === 'createdBy') {
        // "who created it" is named differently on each record type
        // (lost cases have an owner, found reports have a reporter).
        const haystack = normalize(`${record.ownerName || ''} ${record.reporterName || ''}`);
        if (!haystack.includes(normalize(value))) return false;
      } else if (!normalize(record[field.key]).includes(normalize(value))) {
        return false;
      }
      continue;
    }

    if (field.type === 'boolean') {
      if (Boolean(record[field.key]) !== (value === 'yes')) return false;
      continue;
    }

    if (field.type === 'date') {
      if (!record.createdAt) return false;
      const created = record.createdAt.toDate ? record.createdAt.toDate() : new Date(record.createdAt);
      if (field.key === 'createdFrom' && created < new Date(value)) return false;
      if (field.key === 'createdTo' && created > new Date(`${value}T23:59:59.999`)) return false;
      continue;
    }

    if (record[field.key] !== value) return false;
  }
  return true;
}
