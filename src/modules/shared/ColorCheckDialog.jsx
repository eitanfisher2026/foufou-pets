import { useState } from 'react';
import SelectField from './SelectField.jsx';

/**
 * Shown right after creating a record whose color came out as "אחר" -
 * whether from an AI misread or a manual "אחר" pick - as a gentle nudge to
 * pick something more specific, since color is a real matching signal.
 * Never blocks anything: the record is already saved by the time this
 * shows, and skipping just leaves it as "אחר". Reuses SelectField so the
 * picker here looks and behaves exactly like every other color field in
 * the app.
 */
export default function ColorCheckDialog({ colorOptions, onSave, onSkip }) {
  const [color, setColor] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!color) return;
    setSaving(true);
    try {
      await onSave(color);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onSkip}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-lg font-bold text-slate-800">הצבע שנקבע הוא "אחר"</h2>
        <p className="mb-4 text-sm text-slate-600">
          אם יש צבע מדויק יותר, כדאי לבחור אותו - זה משפר את איכות ההתאמות בהמשך. אפשר גם לדלג ולהשאיר "אחר".
        </p>

        <div className="mb-4">
          <SelectField label="בחירת צבע" placeholder="בחר/י צבע" value={color} onChange={setColor} options={colorOptions} />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!color || saving}
            className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            עדכון הצבע
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
