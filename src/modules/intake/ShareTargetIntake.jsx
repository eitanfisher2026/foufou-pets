import { useEffect, useRef, useState } from 'react';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import BackLink from '../shared/BackLink.jsx';
import { takePendingShare } from '../shared/shareTargetStorage.js';
import { useSmartIntake } from './useSmartIntake.js';

/**
 * Landing page for Android's "Share" menu (registered as a share_target in
 * manifest.json). The service worker already stashed whatever was shared -
 * this screen just picks it up once and runs it through the same
 * lost/found auto-detect flow as the manual smart-intake upload, so sharing
 * a Facebook post in is exactly as good as uploading its screenshot by hand.
 */
export default function ShareTargetIntake() {
  const { files, setFiles, extracted, busy, reading, readError, analyze, createFromType, creating, cancelReading } =
    useSmartIntake();
  const [status, setStatus] = useState('loading'); // loading | empty | no-photo | done
  const [sharedText, setSharedText] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    takePendingShare().then((share) => {
      // Genuinely nothing came through - either this page was opened
      // directly (not via a share), or the pending share was already
      // consumed by an earlier load of this same page (e.g. a service
      // worker update reloading mid-share). Worth telling apart from "we
      // got a link/text but no photo", which is a normal, expected case.
      if (!share || (share.photos.length === 0 && !share.text && !share.url)) {
        setStatus('empty');
        return;
      }
      const text = [share.text, share.url].filter(Boolean).join('\n');
      setSharedText(text);
      if (share.photos.length === 0) {
        setStatus('no-photo');
        return;
      }
      setStatus('done');
      setFiles(share.photos);
      analyze(text, share.photos);
    });
    // analyze/setFiles are stable enough for a one-time, on-mount import - not a dependency we want to re-run on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualUpload(e) {
    const newFiles = Array.from(e.target.files || []);
    e.target.value = '';
    setFiles(newFiles);
    await analyze(sharedText, newFiles);
  }

  return (
    <div className="space-y-5 p-4">
      <BackLink to="/">ביטול וחזרה לעמוד הראשי</BackLink>
      <h1 className="text-xl font-bold text-slate-800">פוסט ששותף מפייסבוק</h1>

      {status === 'loading' && <AnalyzingIndicator />}

      {status === 'empty' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            לא זיהינו תוכן ששותף לכאן. זה יכול לקרות אם הדף נפתח ישירות (לא דרך "שיתוף"), או אם משהו השתבש באמצע -
            נסו שוב מהאפליקציה של פייסבוק: שיתוף ← חיות אבודות.
          </p>
        </div>
      )}

      {status === 'no-photo' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            קיבלנו את הטקסט/קישור של הפוסט - שיתוף הפוסט הוא צעד ראשון טוב, בעיקר כשיש טקסט ארוך שנחתך בצילום מסך
            ("...עוד"). עכשיו נשאר רק לצרף תמונה של החתולה כדי שנוכל לזהות אותה.
          </p>
          <p className="mt-2 text-sm text-amber-800">
            אם בפוסט תמונה אחת בלבד - צילום מסך של הפוסט כולו מספיק. אם יש בו כמה תמונות - עדיף לצרף גם תמונה
            בודדת וממוקדת של החתולה עצמה (בנוסף לצילום המסך), כדי שהתמונה הראשית של הרשומה תצא מדויקת.
          </p>
          {sharedText && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-600">{sharedText}</p>
          )}
        </div>
      )}

      {reading && <AnalyzingIndicator onCancel={cancelReading} />}
      {creating && <AnalyzingIndicator />}
      {readError && <p className="text-sm text-red-600">{readError}</p>}

      {status !== 'loading' && !creating && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            {status === 'empty' || status === 'no-photo' ? 'צירוף תמונה/ות' : 'רוצה לנסות תמונה אחרת?'}
          </label>
          <input type="file" accept="image/*" multiple onChange={handleManualUpload} disabled={busy} />
        </div>
      )}

      {extracted && !extracted.reportType && !creating && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="mb-3 text-sm text-amber-800">
            לא הצלחנו לזהות אוטומטית מהפוסט אם זה דיווח על חתול שאבד או שנמצא - איזה מהם זה?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => createFromType(extracted, 'lost', files)}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2 font-medium text-white"
            >
              חתול שאבד
            </button>
            <button
              type="button"
              onClick={() => createFromType(extracted, 'found', files)}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white"
            >
              חתול שנמצא/נראה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
