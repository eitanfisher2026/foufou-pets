/**
 * Privacy policy as an in-app dialog, not a page navigation - opening it
 * used to leave the account menu entirely and rely on the browser's own
 * back button to return, which doesn't exist as a concept inside an
 * installed PWA the way it does in a browser tab. Embeds the real
 * public/privacy.html via iframe rather than duplicating its text here -
 * that file still needs to exist as a real, standalone URL on its own
 * (for the Google OAuth consent screen, and anywhere else a plain link is
 * required outside the app), so this reads the same one document instead
 * of risking two copies drifting apart.
 */
export default function PrivacyDialog({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
            <span>🔒</span> מדיניות פרטיות
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-xl leading-none text-slate-400">
            ✕
          </button>
        </div>
        <iframe src="/privacy.html" title="מדיניות פרטיות" className="min-h-0 flex-1 rounded-b-2xl" />
      </div>
    </div>
  );
}
