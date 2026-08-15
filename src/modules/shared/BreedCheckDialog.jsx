import { useState } from 'react';
import SelectField from './SelectField.jsx';

/**
 * Shown right after creating a dog record whose breed came out as "מעורב
 * (לא ידוע)" (the AI's own fallback for "couldn't confidently identify a
 * breed") - a gentle nudge to pick a specific breed if the person reviewing
 * it happens to know one, same non-blocking pattern as ColorCheckDialog.
 * Dog-only: cats don't get this nudge, since the overwhelming majority of
 * cat reports are genuinely mixed/street cats with no identifiable breed,
 * unlike a dog where a purebred/recognizable mix is common enough to be
 * worth double-checking.
 */
export default function BreedCheckDialog({ breedOptions, onSave, onSkip }) {
  const [breed, setBreed] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!breed) return;
    setSaving(true);
    try {
      await onSave(breed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onSkip}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-lg font-bold text-slate-800">הגזע לא זוהה - מעורב</h2>
        <p className="mb-4 text-sm text-slate-600">
          אם ידוע גזע מסוים, אפשר לבחור אותו כאן. אפשר גם לדלג ולהשאיר "מעורב (לא ידוע)".
        </p>

        <div className="mb-4">
          <SelectField label="בחירת גזע" placeholder="בחר/י גזע" value={breed} onChange={setBreed} options={breedOptions} />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!breed || saving}
            className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            עדכון הגזע
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            דילוג
          </button>
        </div>
      </div>
    </div>
  );
}
