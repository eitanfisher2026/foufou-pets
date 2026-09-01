import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { usePwaInstall } from './usePwaInstall.js';
import AboutDialog from './AboutDialog.jsx';
import FeedbackDialog from '../feedback/FeedbackDialog.jsx';

/**
 * The personal-account entry point on the dashboard header: a round
 * profile-photo button that opens a small menu (feedback, about, share,
 * install, sign out). Settings moved out to its own admin-only ⚙️ icon
 * right in the header (see Dashboard.jsx) - it's app configuration, not a
 * personal action, and burying the one thing an admin actually needs
 * regularly inside a menu named after their own photo was never a great
 * fit anyway. The small chevron badge on the avatar exists purely so this
 * reads as "tap for a menu" rather than "here's my photo" - the menu
 * contents were never really the discoverability problem.
 */
export default function ProfileMenu() {
  const { user, signOut } = useAuth();
  const { installed, canPrompt, isIOS, promptInstall } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setShowIosGuide(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

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
      text: 'אפליקציה לניהול חיפוש אחר חתולים וכלבים אבודים והתאמה לדיווחים על חיות שנמצאו',
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
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="relative block shrink-0">
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            className="h-9 w-9 rounded-full ring-2 ring-white shadow"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-600 shadow">
            {(user?.displayName || user?.email || '?')[0]}
          </span>
        )}
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[9px] leading-none text-white ring-2 ring-white"
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          style={{ insetInlineEnd: 0 }}
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate font-medium text-slate-800">{user?.displayName}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowFeedback(true);
            }}
            className="block w-full px-4 py-2.5 text-right text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            💬 שליחת משוב
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowAbout(true);
            }}
            className="block w-full px-4 py-2.5 text-right text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ℹ️ אודות
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="block w-full px-4 py-2.5 text-right text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            שיתוף האפליקציה
          </button>
          {shareNotice && <p className="px-4 pb-2 text-xs text-slate-500 break-all">{shareNotice}</p>}

          {!installed && (canPrompt || isIOS) && (
            <>
              <button
                type="button"
                onClick={handleInstallClick}
                className="block w-full px-4 py-2.5 text-right text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                התקנת האפליקציה
              </button>
              {showIosGuide && (
                <p className="px-4 pb-2 text-xs text-slate-500">
                  ב-Safari: לחצו על כפתור השיתוף (הריבוע עם החץ למעלה), ואז על "הוסף למסך הבית".
                </p>
              )}
            </>
          )}

          <button
            type="button"
            onClick={signOut}
            className="block w-full border-t border-slate-100 px-4 py-2.5 text-right text-sm font-medium text-red-600 hover:bg-slate-50"
          >
            התנתקות
          </button>
        </div>
      )}

      {showFeedback && <FeedbackDialog onClose={() => setShowFeedback(false)} />}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </div>
  );
}
