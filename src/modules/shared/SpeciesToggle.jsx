import { SPECIES, SPECIES_LABELS } from './collections.js';

/**
 * Two-way cat/dog switch shown at the top of every create form - species is
 * fixed once a record is created (see lostReportApi.js/foundReportApi.js),
 * so this only ever appears where the record doesn't exist yet, never in
 * an edit form.
 */
export default function SpeciesToggle({ value, onChange }) {
  return (
    <div className="mb-4 flex gap-2">
      {Object.values(SPECIES).map((species) => (
        <button
          key={species}
          type="button"
          onClick={() => onChange(species)}
          className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium ${
            value === species ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 text-slate-600'
          }`}
        >
          {SPECIES_LABELS[species]}
        </button>
      ))}
    </div>
  );
}
