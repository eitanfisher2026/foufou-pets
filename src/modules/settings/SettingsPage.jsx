import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { usePwaInstall } from '../shared/usePwaInstall.js';
import { APP_VERSION } from '../../version.js';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { installed, canPrompt, isIOS, promptInstall } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [shareNotice, setShareNotice] = useState('');

  async function handleInstallClick() {
    if (canPrompt) {
      await promptInstall();
    } else if (isIOS) {
      setShowIosGuide((v) => !v);
    }
  }

  async function handleShare() {
    const shareData = {
      title: 'איתור חיות מחמד',
      text: 'אפליקציה לניהול חיפוש אחר חתולים אבודים והתאמה לדיווחי חתולים שנמצאו',
      url: window.location.origin,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled the share sheet - not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      setShareNotice('הקישור הועתק ללוח');
      setTimeout(() => setShareNotice(''), 2500);
    } catch {
      setShareNotice(shareData.url);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4 pb-10">
      <Link to="/" className="mb-4 inline-block text-sm text-slate-500 underline">
        ← חזרה לעמוד הראשי
      </Link>
      <h1 className="mb-6 text-xl font-bold text-slate-800">הגדרות</h1>

      <section className="mb-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        {user?.photoURL && (
          <img src={user.photoURL} alt="" className="h-12 w-12 rounded-full" referrerPolicy="no-referrer" />
        )}
        <div>
          <p className="font-medium text-slate-800">{user?.displayName}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
        </div>
      </section>

      <nav className="mb-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <Link to="/settings/matching" className="flex items-center justify-between p-4 hover:bg-slate-50">
          <span className="font-medium text-slate-700">פרמטרים להתאמה</span>
          <span className="text-slate-400">‹</span>
        </Link>

        <div className="bg-amber-50/60 p-4">
          <div className="flex items-center gap-3">
            <img src="/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl shadow-sm" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800">התקנת האפליקציה</p>
              <p className="text-xs text-slate-500">
                {installed ? 'כבר מותקנת במכשיר הזה' : 'גישה מהירה ממסך הבית, כמו אפליקציה רגילה'}
              </p>
            </div>
            {!installed && (canPrompt || isIOS) && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="shrink-0 rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white"
              >
                התקנה
              </button>
            )}
          </div>
          {!installed && !canPrompt && !isIOS && (
            <p className="mt-2 text-xs text-slate-400">ההתקנה לא זמינה בדפדפן הזה</p>
          )}
          {showIosGuide && (
            <p className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600">
              ב-Safari: לחצו על כפתור השיתוף (הריבוע עם החץ למעלה), ואז על "הוסף למסך הבית".
            </p>
          )}
        </div>

        <div className="p-4">
          <button type="button" onClick={handleShare} className="font-medium text-slate-700">
            שיתוף האפליקציה
          </button>
          {shareNotice && <p className="mt-2 text-xs text-slate-500 break-all">{shareNotice}</p>}
        </div>

        <button type="button" onClick={signOut} className="w-full p-4 text-right font-medium text-red-600">
          התנתקות
        </button>
      </nav>

      <p className="text-center text-xs text-slate-300">{APP_VERSION}</p>
    </div>
  );
}
