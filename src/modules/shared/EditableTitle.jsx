import { useState } from 'react';

/**
 * The record's display-name header (lost case's name / found report's
 * title), with a pencil to rename it right here on the view page - no need
 * to open full edit mode just to fix or add a name. `displayText` is
 * whatever's already shown today (the field itself, or its computed
 * fallback - see displayLostCaseName/displayFoundReportName); `defaultDraft`
 * is that same fallback text alone, used to prefill the input when the
 * stored field is empty, so confirming a sensible default is one tap
 * instead of retyping it from scratch.
 */
export default function EditableTitle({ value, displayText, defaultDraft, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setDraft(value || defaultDraft || '');
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <input
          autoFocus
          className="input min-w-0 flex-1 text-lg font-bold"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          aria-label="שמירת השם"
          className="shrink-0 text-lg leading-none text-emerald-600 disabled:opacity-50"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          aria-label="ביטול עריכת השם"
          className="shrink-0 text-lg leading-none text-slate-400 disabled:opacity-50"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="min-w-0 break-words text-xl font-bold text-slate-800">{displayText}</h1>
      <button
        type="button"
        onClick={startEditing}
        aria-label="עריכת השם"
        className="shrink-0 text-sm text-slate-400 hover:text-slate-600"
      >
        ✏️
      </button>
    </>
  );
}
