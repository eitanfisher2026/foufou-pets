import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { usePwaInstall } from './usePwaInstall.js';
import AboutDialog from './AboutDialog.jsx';
import FeedbackDialog from '../feedback/FeedbackDialog.jsx';

/**
 * The single account entry point on the dashboard header. For a regular
 * user/editor, the trigger is their own profile photo with a small chevron
 * badge (so it reads as "tap for a menu" rather than "here's my photo" -
 * the menu contents were never really the discoverability problem, the
 * invisible trigger was). For an admin, the trigger is a plain ⚙️ icon
 * instead of their photo - one icon covers both "app settings" and "my
 * account", rather than two separate header controls competing for the
 * same limited row on mobile; the menu itself just gains a "הגדרות" link
 * at the top in that case.
 */
export default function ProfileMenu() {
  const { user, signOut, isAdmin, roleLoading } = useAuth();
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
      <button type="button" onClick={() => setOpen((v) => !v)} className="relative block shrink-0" aria-label="תפריט חשבון">
        {roleLoading ? (
          // isAdmin is false (its own default) until the role check
          // actually resolves - rendering straight off it here briefly
          // showed the photo, then swapped to the gear icon a moment
          // later for an admin. A neutral placeholder while roleLoading is
          // true means committing to the real icon only once, correctly.
          <span className="block h-9 w-9 animate-pulse rounded-full bg-slate-200 shadow" />
        ) : isAdmin ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-base shadow">⚙️</span>
        ) : user?.photoURL ? (
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
        {!roleLoading && !isAdmin && (
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[9px] leading-none text-white ring-2 ring-white"
          >
            ▾
          </span>
        )}
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

          {isAdmin && (
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ⚙️ הגדרות
            </Link>
          )}

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
