import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { getHelpContent, saveHelpContent } from './helpContentApi.js';

/**
 * "How does this work" explainer, reached via the ℹ️ button next to the
 * dashboard header. Admin-editable (Firestore-backed, config/helpContent),
 * same edit/save/cancel pattern as AboutDialog.jsx - a regular user just
 * reads it.
 */
export default function HelpDialog({ onClose }) {
  const { isAdmin } = useAuth();
  const [text, setText] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getHelpContent().then(setText);
  }, []);

  function startEditing() {
    setDraft(text || '');
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveHelpContent(draft);
      setText(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-l from-blue-500 to-indigo-500 px-4 py-3 text-white">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <span>ℹ️</span> איך זה עובד?
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-xl leading-none text-white/90">
            ✕
          </button>
        </div>

        <div className="p-4">
          {text === null ? (
            <p className="text-sm text-slate-400">טוען...</p>
          ) : editing ? (
            <>
              <textarea
                className="input w-full"
                rows={16}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="כתבו כאן את תוכן העזרה..."
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'שומר...' : '💾 שמירה'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
                >
                  ביטול
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{text}</p>
              {isAdmin && (
                <button type="button" onClick={startEditing} className="mt-3 text-xs text-blue-600 underline">
                  ✏️ עריכה
                </button>
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-3 text-center">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-6 py-2 text-sm font-medium text-white">
            סגירה
          </button>
        </div>
      </div>
    </div>
  );
}
