import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { getAboutContent, saveAboutContent } from './aboutContentApi.js';
import { APP_VERSION } from '../../version.js';

/**
 * "About" info dialog - the text body is admin-editable (stored in
 * Firestore, see aboutContentApi.js), same idea as FouFou's about dialog,
 * just Hebrew-only since this app has no English UI. Everyone can read it;
 * only an admin sees the edit control.
 */
export default function AboutDialog({ onClose }) {
  const { isAdmin } = useAuth();
  const [text, setText] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAboutContent().then(setText);
  }, []);

  function startEditing() {
    setDraft(text || '');
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveAboutContent(draft);
      setText(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
            <span>🐾</span> אודות
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-xl leading-none text-slate-400">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          {text === null ? (
            <p className="text-sm text-slate-400">טוען...</p>
          ) : editing ? (
            <>
              <textarea
                className="input w-full"
                rows={6}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="כתבו כאן על האפליקציה..."
              />
              <div className="flex gap-2">
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
              <p className="whitespace-pre-wrap text-sm text-slate-700">{text}</p>
              {isAdmin && (
                <button type="button" onClick={startEditing} className="text-xs text-blue-600 underline">
                  ✏️ עריכה
                </button>
              )}
            </>
          )}

          <div className="border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
            <p>© FouFou-Pets</p>
            <p>2026 {APP_VERSION}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
