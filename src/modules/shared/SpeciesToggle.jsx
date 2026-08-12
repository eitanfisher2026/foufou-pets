import { SPECIES, SPECIES_LABELS } from './collections.js';

const SPECIES_ICONS = {
  [SPECIES.CAT]: '🐱',
  [SPECIES.DOG]: '🐶',
};

/**
 * Two-way cat/dog switch shown at the top of every create form - species is
 * fixed once a record is created (see lostReportApi.js/foundReportApi.js),
 * so this only ever appears where the record doesn't exist yet, never in
 * an edit form. Small icon buttons rather than full-width text buttons, since
 * this is a quick toggle, not a primary action.
 */
export default function SpeciesToggle({ value, onChange }) {
  return (
    <div className="mb-4 flex gap-2">
      {Object.values(SPECIES).map((species) => (
        <button
          key={species}
          type="button"
          onClick={() => onChange(species)}
          title={SPECIES_LABELS[species]}
          aria-label={SPECIES_LABELS[species]}
          aria-pressed={value === species}
          className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-xl transition ${
            value === species ? 'border-slate-800 bg-slate-100' : 'border-slate-200 bg-white'
          }`}
        >
          {SPECIES_ICONS[species]}
        </button>
      ))}
    </div>
  );
}
