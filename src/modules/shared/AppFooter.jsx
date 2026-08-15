import { APP_VERSION } from '../../version.js';

// Same 3-row shape as the footer in Eitan's other apps (FouFou etc.):
// app name/tagline, copyright, then the version number - small and muted,
// out of the way at the bottom instead of competing with the page header.
export default function AppFooter() {
  return (
    <div className="mt-8 border-t border-slate-200 pt-3 text-center">
      <p className="mb-1 text-xs font-medium text-slate-500">🐾 איתור חיות מחמד</p>
      <p className="mb-1 text-xs text-slate-300">© Eitan Fisher</p>
      <p className="text-xs text-slate-300">{APP_VERSION}</p>
    </div>
  );
}
