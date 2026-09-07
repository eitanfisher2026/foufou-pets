import { useState } from 'react';
import { APP_VERSION } from '../../version.js';
import PrivacyDialog from './PrivacyDialog.jsx';

// Same 3-row shape as the footer in Eitan's other apps (FouFou etc.):
// app name/tagline, copyright, then the version number - small and muted,
// out of the way at the bottom instead of competing with the page header.
export default function AppFooter() {
  const [showPrivacy, setShowPrivacy] = useState(false);
  return (
    <div className="mt-8 border-t border-slate-200 pt-3 text-center">
      <p className="mb-1 text-xs font-medium text-slate-500">🐾 איתור חיות מחמד</p>
      <p className="mb-1 text-xs text-slate-300">© FouFou-Pets</p>
      <p className="mb-1 text-xs text-slate-300">2026 {APP_VERSION}</p>
      <button type="button" onClick={() => setShowPrivacy(true)} className="text-xs text-slate-400 underline">
        מדיניות פרטיות
      </button>
      {showPrivacy && <PrivacyDialog onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
