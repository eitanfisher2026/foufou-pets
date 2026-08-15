import { SPECIES, SPECIES_LABELS } from './collections.js';

const SPECIES_ICONS = {
  [SPECIES.CAT]: '🐱',
  [SPECIES.DOG]: '🐶',
};

/**
 * Two-way cat/dog switch shown at the top of the dashboard - species is
 * fixed once a record is created (see lostReportApi.js/foundReportApi.js),
 * so this only ever appears there, never in a form. A segmented pill
 * control (light track, active side lifted on a white pill) rather than
 * two separate circular buttons - reads as one connected choice instead of
 * two independent toggles, and the label alongside each icon means a new
 * user doesn't have to guess which paw means which species.
 */
export default function SpeciesToggle({ value, onChange }) {
  return (
    <div className="mb-4 inline-flex gap-0.5 rounded-full bg-slate-100 p-1">
      {Object.values(SPECIES).map((species) => (
        <button
          key={species}
          type="button"
          onClick={() => onChange(species)}
          aria-pressed={value === species}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
            value === species ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
          }`}
        >
          <span className="text-base">{SPECIES_ICONS[species]}</span>
          {SPECIES_LABELS[species]}
        </button>
      ))}
    </div>
  );
}
