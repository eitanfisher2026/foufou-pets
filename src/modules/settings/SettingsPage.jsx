import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import BackLink from '../shared/BackLink.jsx';
import { rescanAllLostCases, backfillPhotoSimilarityForExistingMatches } from '../matching/matchingApi.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { CONFIDENCE_BUCKETS } from '../matching/matchingEngine.js';
import { useVisualMatchAlert } from '../shared/useVisualMatchAlert.jsx';
import { countOldActiveRecords, archiveOldRecords } from './archiveOldRecordsApi.js';
import AppFooter from '../shared/AppFooter.jsx';

function photoThresholdLabel(key) {
  if (key === 'never') return 'כבוי';
  return CONFIDENCE_BUCKETS.find((b) => b.key === key)?.label || key;
}

function defaultArchiveCutoffDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function ProgressBar({ progress }) {
  if (!progress) return null;
  return (
    <div className="mt-3">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-slate-800 transition-all duration-300"
          style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {progress.done} מתוך {progress.total} תיקים
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [rescanning, setRescanning] = useState(false);
  const [rescanProgress, setRescanProgress] = useState(null);
  const [rescanResult, setRescanResult] = useState(null);
  const [photoBackfilling, setPhotoBackfilling] = useState(false);
  const [photoBackfillProgress, setPhotoBackfillProgress] = useState(null);
  const [photoBackfillResult, setPhotoBackfillResult] = useState(null);
  // Both actions below silently do nothing if the threshold set in
  // "פרמטרים להתאמה" was never actually saved there (it's a separate page,
  // with its own save button at the bottom of a long form) - showing the
  // value actually in effect right here, not just on the settings page
  // that sets it, is what makes that possible to catch instead of looking
  // like the action itself is broken.
  const [photoMatchThreshold, setPhotoMatchThreshold] = useState(null);
  const [photoDisqualifyThreshold, setPhotoDisqualifyThreshold] = useState(null);
  const [archiveCutoffDate, setArchiveCutoffDate] = useState(defaultArchiveCutoffDate);
  const [archivePreview, setArchivePreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveProgress, setArchiveProgress] = useState(null);
  const [archiveResult, setArchiveResult] = useState(null);

  useEffect(() => {
    getMatchConfig().then((c) => {
      setPhotoMatchThreshold(c.photoMatchThreshold);
      setPhotoDisqualifyThreshold(c.photoDisqualifyThreshold);
    });
  }, []);
  const { notify: notifyVisualMatch, dialog: visualMatchDialog } = useVisualMatchAlert();

  async function handleRescanAll() {
    setRescanning(true);
    setRescanResult(null);
    setRescanProgress({ done: 0, total: 0 });
    try {
      const result = await rescanAllLostCases((done, total) => setRescanProgress({ done, total }));
      setRescanResult(result);
      notifyVisualMatch(result.visualMatches);
    } finally {
      setRescanning(false);
    }
  }

  async function handlePhotoBackfill() {
    setPhotoBackfilling(true);
    setPhotoBackfillResult(null);
    setPhotoBackfillProgress({ done: 0, total: 0 });
    try {
      const result = await backfillPhotoSimilarityForExistingMatches((done, total) =>
        setPhotoBackfillProgress({ done, total })
      );
      setPhotoBackfillResult(result);
      notifyVisualMatch(result.visualMatches);
    } finally {
      setPhotoBackfilling(false);
    }
  }

  // Two-step on purpose - counting first, archiving only once the admin has
  // actually seen how many records (and of which species) a given cutoff
  // date would touch, since this isn't reversible from within the app.
  // Changing the date after a preview was shown clears it, so the counts on
  // screen can never end up describing a date that's no longer selected.
  async function handlePreviewArchive() {
    setPreviewing(true);
    setArchiveResult(null);
    try {
      const counts = await countOldActiveRecords(new Date(archiveCutoffDate));
      setArchivePreview({ cutoffDate: archiveCutoffDate, ...counts });
    } finally {
      setPreviewing(false);
    }
  }

  function handleCutoffDateChange(value) {
    setArchiveCutoffDate(value);
    setArchivePreview(null);
  }

  async function handleConfirmArchive() {
    setArchiving(true);
    setArchiveProgress({ done: 0, total: 0 });
    try {
      const result = await archiveOldRecords(new Date(archivePreview.cutoffDate), user?.displayName || user?.email || '', (done, total) =>
        setArchiveProgress({ done, total })
      );
      setArchiveResult(result);
      setArchivePreview(null);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="p-4 pb-10">
      <BackLink to="/">חזרה לעמוד הראשי</BackLink>
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
        <Link to="/settings/users" className="flex items-center justify-between p-4 hover:bg-slate-50">
          <span className="font-medium text-slate-700">ניהול משתמשים</span>
          <span className="text-slate-400">‹</span>
        </Link>

        <Link to="/settings/matching" className="flex items-center justify-between p-4 hover:bg-slate-50">
          <span className="font-medium text-slate-700">פרמטרים להתאמה</span>
          <span className="text-slate-400">‹</span>
        </Link>

        <Link to="/settings/cost" className="flex items-center justify-between p-4 hover:bg-slate-50">
          <span className="font-medium text-slate-700">עלויות</span>
          <span className="text-slate-400">‹</span>
        </Link>

        <button type="button" onClick={signOut} className="w-full p-4 text-right font-medium text-red-600">
          התנתקות
        </button>
      </nav>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-medium text-slate-700">סריקה מחדש של כל ההתאמות</h2>
        <p className="mb-3 text-sm text-slate-500">
          מאפס וסורק מחדש את ההתאמות של כל תיק חיפוש פעיל (חתולים וכלבים) מול כל הדיווחים הפעילים - אותה פעולה כמו
          "איפוס כל ההתאמות וסריקה מחדש" בתוך תיק בודד, רק על כל התיקים יחד. שימושי אחרי שינוי באלגוריתם ההתאמה, כדי
          שההתאמות הקיימות ישקפו את הלוגיקה העדכנית ולא רק תיקים שמישהו פתח וסרק ידנית. כולל גם השוואת תמונות AI
          להתאמות שעוברות את הסף שהוגדר ב"פרמטרים להתאמה" - יכול לקחת זמן ולעלות יותר מהרגיל אם יש הרבה תיקים.
        </p>
        {photoMatchThreshold && (
          <p className="mb-3 text-xs text-slate-400">
            סף השוואת תמונות פעיל כרגע: <span className="font-medium text-slate-600">{photoThresholdLabel(photoMatchThreshold)}</span>
            {' · '}סף פסילה לפי תמונה: <span className="font-medium text-slate-600">{photoThresholdLabel(photoDisqualifyThreshold)}</span>
          </p>
        )}
        <button
          type="button"
          onClick={handleRescanAll}
          disabled={rescanning}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
        >
          {rescanning ? 'סורק מחדש...' : 'הרצה'}
        </button>
        {rescanning && <ProgressBar progress={rescanProgress} />}
        {rescanResult && (
          <p className="mt-2 text-sm text-emerald-700">
            נסרקו מחדש {rescanResult.casesProcessed} תיקי חיפוש, נמצאו {rescanResult.matchesScored} התאמות בסך הכל.
          </p>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-medium text-slate-700">השוואת תמונות AI להתאמות קיימות</h2>
        <p className="mb-3 text-sm text-slate-500">
          בלי לאפס או לסרוק מחדש שום דבר אחר - עובר על ההתאמות הקיימות של כל תיק חיפוש פעיל, ומחשב לכל התאמה שעדיין
          לא עברה השוואת תמונות (או שעברה בעזרת גרסת AI ישנה שהוחלפה) ציון עדכני (לפי הנתונים וההגדרות הנוכחיים, גם
          אם ההתאמה נבדקה לפני שינוי באלגוריתם) - ואם הציון העדכני עובר את סף הסבירות שהוגדר ב"פרמטרים להתאמה", מריץ
          את ההשוואה עכשיו. תיקים שאינם פעילים (טופלו/בארכיון/מושהים) לא נבדקים כאן בכלל - אפשר להריץ "סריקה חוזרת"
          על התאמה ספציפית בתוך תיק כזה אם צריך.
        </p>
        {photoMatchThreshold && (
          <p className="mb-3 text-xs text-slate-400">
            סף השוואת תמונות פעיל כרגע: <span className="font-medium text-slate-600">{photoThresholdLabel(photoMatchThreshold)}</span>
            {' · '}סף פסילה לפי תמונה: <span className="font-medium text-slate-600">{photoThresholdLabel(photoDisqualifyThreshold)}</span>
            {photoMatchThreshold === 'never' && ' - כבוי, ההרצה לא תבדוק כלום. שנו אותו ב"פרמטרים להתאמה" ולחצו שם על "שמירת ההגדרות".'}
          </p>
        )}
        <button
          type="button"
          onClick={handlePhotoBackfill}
          disabled={photoBackfilling}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
        >
          {photoBackfilling ? 'משווה תמונות...' : 'הרצה'}
        </button>
        {photoBackfilling && <ProgressBar progress={photoBackfillProgress} />}
        {photoBackfillResult && (
          <p className="mt-2 text-sm text-emerald-700">
            נסרקו {photoBackfillResult.casesScanned} תיקי חיפוש, הושוו תמונות ב-{photoBackfillResult.pairsChecked}{' '}
            התאמות.
            {(photoBackfillResult.skippedBelowThreshold > 0 || photoBackfillResult.skippedClosed > 0) && (
              <>
                {' '}
                <span className="text-slate-500">
                  ({photoBackfillResult.skippedBelowThreshold} מתחת לסף לפי הציון העדכני
                  {photoBackfillResult.skippedClosed > 0 && `, ${photoBackfillResult.skippedClosed} בתיקים לא פעילים`} -
                  לא נבדקו)
                </span>
              </>
            )}
          </p>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-medium text-slate-700">העברת רשומות ישנות לארכיון</h2>
        <p className="mb-3 text-sm text-slate-500">
          מעביר לארכיון כל תיק חיפוש ודיווח פעילים (חתולים וכלבים) שנוצרו לפני התאריך שנבחר - שימושי לפינוי רשימות
          עבודה מרשומות ישנות שכנראה לא רלוונטיות יותר. תיק שהועבר לארכיון בדרך זו מסומן ב"ארכוב אוטומטי - מעל חודש
          במערכת" (נראה בעמוד הארכיון), ומפסיק להיבדק בסריקות התאמה עתידיות - בדיוק כמו כל רשומה לא פעילה אחרת.
          הסטוריית ההתאמות הקיימת שלו נשארת כפי שהיא, לצפייה בלבד.
        </p>
        <label className="mb-3 block text-sm text-slate-600">
          תיקים ודיווחים שנוצרו לפני תאריך זה יועברו לארכיון
          <input
            type="date"
            dir="ltr"
            className="input mt-1 block w-full max-w-[10rem]"
            value={archiveCutoffDate}
            onChange={(e) => handleCutoffDateChange(e.target.value)}
          />
        </label>

        {!archivePreview && !archiveResult && (
          <button
            type="button"
            onClick={handlePreviewArchive}
            disabled={previewing || !archiveCutoffDate}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            {previewing ? 'בודק...' : 'בדיקה'}
          </button>
        )}

        {archivePreview && !archiving && (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="mb-3 text-sm text-slate-700">
              נמצאו לארכוב: <strong>{archivePreview.lostCats + archivePreview.lostDogs}</strong> תיקי חיפוש (
              {archivePreview.lostCats} חתולים, {archivePreview.lostDogs} כלבים) ו-
              <strong>{archivePreview.foundCats + archivePreview.foundDogs}</strong> דיווחים ({archivePreview.foundCats}{' '}
              חתולים, {archivePreview.foundDogs} כלבים).
            </p>
            {archivePreview.lostCats + archivePreview.lostDogs + archivePreview.foundCats + archivePreview.foundDogs === 0 ? (
              <button type="button" onClick={() => setArchivePreview(null)} className="text-sm text-slate-500 underline">
                אין מה לארכב - סגירה
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmArchive}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white"
                >
                  אישור והעברה לארכיון
                </button>
                <button
                  type="button"
                  onClick={() => setArchivePreview(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                >
                  ביטול
                </button>
              </div>
            )}
          </div>
        )}

        {archiving && <ProgressBar progress={archiveProgress} />}
        {archiveResult && (
          <p className="mt-2 text-sm text-emerald-700">
            הועברו לארכיון {archiveResult.lostCasesArchived} תיקי חיפוש ו-{archiveResult.foundReportsArchived} דיווחים.
          </p>
        )}
      </section>

      <AppFooter />
      {visualMatchDialog}
    </div>
  );
}
