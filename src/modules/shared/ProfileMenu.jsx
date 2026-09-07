import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { usePwaInstall } from './usePwaInstall.js';
import AboutDialog from './AboutDialog.jsx';
import PrivacyDialog from './PrivacyDialog.jsx';
import FeedbackDialog from '../feedback/FeedbackDialog.jsx';

/**
 * The single account entry point on the dashboard header - a plain ⚙️ icon
 * for every role, not just admins (it used to be the person's own profile
 * photo for a regular user/editor, with a small chevron badge so it still
 * read as "tap for a menu" rather than "here's my photo" - one consistent
 * icon for everyone is simpler and needs no such badge). The menu
 * contents still differ by role: an admin sees a "הגדרות" link at the top
 * that nobody else does.
 */
export default function ProfileMenu() {
  const { user, signOut, isAdmin, isRealAdmin, viewingAsRegular, toggleViewAsRegular } = useAuth();
  const { installed, canPrompt, isIOS, promptInstall } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
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
        {/* Same gear icon for everyone now, not just admins - it never
            depended on the role resolving (unlike the old avatar/gear
            switch, which needed a loading placeholder to avoid a flash),
            so there's nothing left here to wait on. */}
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-base shadow">⚙️</span>
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
            onClick={() => {
              setOpen(false);
              setShowPrivacy(true);
            }}
            className="block w-full px-4 py-2.5 text-right text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            🔒 מדיניות פרטיות
          </button>

          {isRealAdmin && (
            <button
              type="button"
              onClick={() => {
                toggleViewAsRegular();
                setOpen(false);
              }}
              className="block w-full px-4 py-2.5 text-right text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              👁️ {viewingAsRegular ? 'חזרה לתצוגת מנהל' : 'תצוגה כמשתמש רגיל'}
            </button>
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
      {showPrivacy && <PrivacyDialog onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
