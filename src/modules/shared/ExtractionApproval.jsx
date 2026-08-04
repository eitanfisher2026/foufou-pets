import { useState } from 'react';

/**
 * Shows fields the AI read from a newly-added photo next to the record's
 * current values, so the user can pick which ones to accept before they
 * overwrite existing data. Reuses the same extraction used when creating a
 * new report - here it's just applied to an existing record instead.
 */
export default function ExtractionApproval({ extracted, fieldDefs, currentValues, onApply, onDiscard }) {
  const relevant = fieldDefs.filter((f) => {
    const v = extracted[f.extractedKey];
    return v !== null && v !== undefined && v !== '';
  });

  const [approved, setApproved] = useState(() => Object.fromEntries(relevant.map((f) => [f.targetKey, true])));

  if (relevant.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">לא זוהה מידע חדש בתמונה.</p>;
  }

  function toggle(key) {
    setApproved((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleApply() {
    const updates = {};
    for (const f of relevant) {
      if (approved[f.targetKey]) updates[f.targetKey] = extracted[f.extractedKey];
    }
    onApply(updates);
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-800">מידע שזוהה בתמונה - בחר/י מה להחיל (יחליף את הערך הקיים):</p>
      <ul className="space-y-1">
        {relevant.map((f) => (
          <li key={f.targetKey} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!approved[f.targetKey]}
              onChange={() => toggle(f.targetKey)}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-slate-700">{f.label}:</span>{' '}
              <span className="text-slate-600">{formatValue(extracted[f.extractedKey])}</span>
              {currentValues[f.targetKey] ? (
                <span className="block text-xs text-slate-400">ערך נוכחי: {formatValue(currentValues[f.targetKey])}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleApply}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white"
        >
          החלת השינויים שנבחרו
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600"
        >
          התעלמות
        </button>
      </div>
    </div>
  );
}

function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'כן' : 'לא';
  return v;
}
