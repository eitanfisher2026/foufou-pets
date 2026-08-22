import { useState } from 'react';
import { SPECIES, CAT_SIZES, CAT_AGE_CLASSES, CAT_FUR_TYPES, DOG_FUR_TYPES, CAT_PATTERN_DESCRIPTIONS } from '../shared/collections.js';
import { useColorOptions } from '../shared/useColorOptions.js';
import { useBreedOptions } from '../shared/useBreedOptions.js';
import { usePatternOptions } from '../shared/usePatternOptions.js';
import SelectField from '../shared/SelectField.jsx';
import Field from '../shared/Field.jsx';
import { SEARCH_FIELDS, SEARCH_FIELD_GROUPS } from './recordSearch.js';

const BOOLEAN_OPTIONS = [
  { value: 'yes', label: 'כן' },
  { value: 'no', label: 'לא' },
];

const RECORD_TYPE_OPTIONS = [
  { value: 'lost', label: 'תיקי חיפוש (אבד)' },
  { value: 'found', label: 'דיווחים (נמצא)' },
  { value: 'both', label: 'שניהם' },
];

/**
 * Same visual shell as RecordDetailsDialog (grouped bordered sections in a
 * centered modal) but for input, not read-only rows - built generically
 * from SEARCH_FIELDS/SEARCH_FIELD_GROUPS rather than one-off JSX per
 * field, so a new searchable field is a data change there, not a UI change
 * here. Fields whose `speciesOnly` doesn't match the current toggle (e.g.
 * "תבנית פרווה" for a dog search) or whose `recordTypeOnly` doesn't match
 * the chosen lost/found/both scope (e.g. "מצב" only applies to found
 * reports) are skipped entirely rather than shown disabled.
 */
export default function SearchDialog({ species, initialCriteria, onSearch, onClose }) {
  const { recordType: initialRecordType, ...initialFields } = initialCriteria || {};
  const [recordType, setRecordType] = useState(initialRecordType || 'lost');
  const [criteria, setCriteria] = useState(initialFields);
  const colorOptions = useColorOptions(species);
  const breedOptions = useBreedOptions(species);
  const patternOptions = usePatternOptions();
  const patternSelectOptions = patternOptions.map((p) => ({ value: p, label: p, description: CAT_PATTERN_DESCRIPTIONS[p] }));
  const furTypeOptions = species === SPECIES.DOG ? DOG_FUR_TYPES : CAT_FUR_TYPES;

  const resolvedOptions = {
    colorOptions,
    breedOptions,
    patternOptions: patternSelectOptions,
    furTypeOptions,
    sizeOptions: CAT_SIZES,
    ageClassOptions: CAT_AGE_CLASSES,
  };

  function setField(key, value) {
    setCriteria((prev) => ({ ...prev, [key]: value }));
  }

  function handleSearch() {
    onSearch({ recordType, ...criteria });
  }

  function handleReset() {
    setCriteria({});
  }

  const fieldsByGroup = SEARCH_FIELD_GROUPS.map((group) => ({
    ...group,
    fields: SEARCH_FIELDS.filter(
      (f) =>
        f.group === group.key &&
        (!f.speciesOnly || f.speciesOnly === species) &&
        (!f.recordTypeOnly || f.recordTypeOnly === recordType)
    ),
  })).filter((g) => g.fields.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-800">חיפוש מתקדם</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-xl leading-none text-slate-400 hover:text-slate-600"
            aria-label="סגירה"
          >
            ✕
          </button>
        </div>

        <Field label="חיפוש בין" inline>
          <SelectField
            className="w-full max-w-[10rem]"
            label="חיפוש בין"
            allowClear={false}
            value={recordType}
            onChange={setRecordType}
            options={RECORD_TYPE_OPTIONS}
          />
        </Field>

        <div className="mt-4 space-y-4">
          {fieldsByGroup.map((group) => (
            <details key={group.key} className="rounded-xl border border-dotted border-slate-400 p-3" open>
              <summary className="cursor-pointer px-1 text-xs font-bold text-slate-600">{group.title}</summary>
              <div className="mt-3 space-y-3">
                {group.fields.map((field) => (
                  <Field key={field.key} label={field.label} inline>
                    {field.type === 'text' ? (
                      <input
                        className="input w-full"
                        value={criteria[field.key] || ''}
                        onChange={(e) => setField(field.key, e.target.value)}
                      />
                    ) : field.type === 'date' ? (
                      <input
                        type="date"
                        dir="ltr"
                        className="input w-full max-w-[9rem]"
                        value={criteria[field.key] || ''}
                        onChange={(e) => setField(field.key, e.target.value)}
                      />
                    ) : (
                      <SelectField
                        className="w-full max-w-[9rem]"
                        label={field.label}
                        value={criteria[field.key] || ''}
                        onChange={(v) => setField(field.key, v)}
                        options={
                          field.type === 'boolean' ? BOOLEAN_OPTIONS : field.options || resolvedOptions[field.optionsKey] || []
                        }
                        clearLabel="לא משנה"
                        sortAlpha={field.type !== 'boolean'}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </details>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleSearch}
            className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white"
          >
            חיפוש
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
          >
            איפוס
          </button>
        </div>
      </div>
    </div>
  );
}
