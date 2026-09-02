import { useEffect, useState } from 'react';
import { usePwaInstall } from './usePwaInstall.js';
import { getHelpContent } from './helpContentApi.js';

/**
 * Shown automatically, once, the first time someone ever signs in (see
 * hasSeenOnboarding/dismissOnboarding in AuthProvider.jsx) - or on demand
 * via the admin-only preview button in Settings, in which case `onClose`
 * just hides it without marking anything as seen.
 *
 * Two explicit steps, not one long scrollable page - step 1 (welcome +
 * install) used to sit directly above the exact same "how it works" text
 * HelpDialog shows, so the whole thing read as "the ordinary help screen,
 * just appeared instantly" rather than an actual welcome moment. Now step 2
 * only shows once someone deliberately presses "המשך", not the instant the
 * dialog opens. Reuses the exact same admin-editable "how does this work"
 * text as HelpDialog.jsx (fetched eagerly, in the background, so it's
 * already there by the time step 2 is reached) - read-only here, so
 * there's only ever one copy of that explanation to keep current.
 */
export default function OnboardingDialog({ onClose }) {
  const { installed, canPrompt, isIOS, promptInstall } = usePwaInstall();
  const [step, setStep] = useState(1);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [helpText, setHelpText] = useState(null);

  useEffect(() => {
    getHelpContent().then(setHelpText);
  }, []);

  async function handleInstallClick() {
    if (canPrompt) {
      await promptInstall();
    } else if (isIOS) {
      setShowIosGuide((v) => !v);
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
            <span>🐾</span> {step === 1 ? 'ברוכים הבאים!' : 'איך זה עובד'}
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-xl leading-none text-white/90">
            ✕
          </button>
        </div>

        {step === 1 ? (
          <div className="space-y-4 p-4">
            <p className="text-sm leading-relaxed text-slate-700">
              האפליקציה עוזרת לחפש חתולים וכלבים אבודים, ומתאימה אוטומטית בין דיווחים על חיות שאבדו לדיווחים על חיות
              שנראו או נמצאו.
            </p>

            {!installed && (canPrompt || isIOS) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="mb-2 text-sm font-medium text-amber-900">📲 התקנה למסך הבית</p>
                <p className="mb-3 text-xs leading-relaxed text-amber-800">
                  כדי שיהיה אפשר לשתף פוסט מפייסבוק (Meta) ישירות לתוך האפליקציה, היא צריכה קודם להיות מותקנת על המסך
                  הבית - שיתוף לדפדפן רגיל לא עובד לצורך זה.
                </p>
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white"
                >
                  התקנת האפליקציה
                </button>
                {showIosGuide && (
                  <p className="mt-2 text-xs text-amber-800">
                    ב-Safari: לחצו על כפתור השיתוף (הריבוע עם החץ למעלה), ואז על "הוסף למסך הבית".
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            {helpText === null ? (
              <p className="text-sm text-slate-400">טוען...</p>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{helpText}</p>
            )}
          </div>
        )}

        <div className="border-t border-slate-100 px-4 py-3 text-center">
          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-xl bg-slate-800 px-6 py-2 text-sm font-medium text-white"
            >
              המשך
            </button>
          ) : (
            <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-6 py-2 text-sm font-medium text-white">
              הבנתי, בואו נתחיל
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
