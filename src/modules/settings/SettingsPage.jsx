import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import BackLink from '../shared/BackLink.jsx';
import { rescanAllLostCases, backfillPhotoSimilarityForExistingMatches } from '../matching/matchingApi.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { CONFIDENCE_BUCKETS } from '../matching/matchingEngine.js';
import { useVisualMatchAlert } from '../shared/useVisualMatchAlert.jsx';
import { countOldActiveRecords, archiveOldRecords } from './archiveOldRecordsApi.js';
import { getLifetimeStats } from '../shared/lifetimeStatsApi.js';
import { useMaintenanceMode } from '../shared/useMaintenanceMode.js';
import { setMaintenanceMode } from '../shared/maintenanceApi.js';
import { listUsers } from '../users/usersApi.js';
import OnboardingDialog from '../shared/OnboardingDialog.jsx';
import AppFooter from '../shared/AppFooter.jsx';
import ProgressBar from '../shared/ProgressBar.jsx';
import { getErrorMessage } from '../shared/errorMessages.js';
import { useConfirm } from '../shared/useConfirm.jsx';

// Same "opened the app recently" activity window as elsewhere in this file
// would use if it needed one - not a true presence system, just a rough
// sense of who'd actually feel a maintenance-mode kick-out right now.
const MAINTENANCE_ACTIVE_WINDOW_MS = 30 * 60 * 1000;

function photoThresholdLabel(key) {
  if (key === 'never') return 'כבוי';
  return CONFIDENCE_BUCKETS.find((b) => b.key === key)?.label || key;
}

function defaultArchiveCutoffDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [rescanning, setRescanning] = useState(false);
  const [rescanProgress, setRescanProgress] = useState(null);
  const [rescanResult, setRescanResult] = useState(null);
  const [rescanError, setRescanError] = useState('');
  const [photoBackfilling, setPhotoBackfilling] = useState(false);
  const [photoBackfillProgress, setPhotoBackfillProgress] = useState(null);
  const [photoBackfillResult, setPhotoBackfillResult] = useState(null);
  const [photoBackfillError, setPhotoBackfillError] = useState('');
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
  const [archiveError, setArchiveError] = useState('');
  // Pure preview, no side effects - unlike the real onboarding flow (see
  // Dashboard.jsx), closing this never touches hasSeenOnboarding, so
  // reviewing it here can't accidentally leave the admin's own account
  // (or anyone else's) in a test state.
  const [showOnboardingPreview, setShowOnboardingPreview] = useState(false);
  // Permanent audit counters (see lifetimeStatsApi.js) - shown here so
  // there's a real, visible "how many were ever reported/reunited" number
  // an admin can check before deleting old records for good, since that
  // deletion itself no longer leaves anything else behind to count from.
  const [lifetimeStats, setLifetimeStats] = useState(null);
  // Live, not a one-time read - see useMaintenanceMode.js. This page is
  // already admin-only (RequireAdmin in App.jsx), so signed-in is already
  // guaranteed here.
  const maintenanceMode = useMaintenanceMode(true);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState('');

  useEffect(() => {
    getMatchConfig().then((c) => {
      setPhotoMatchThreshold(c.photoMatchThreshold);
      setPhotoDisqualifyThreshold(c.photoDisqualifyThreshold);
    });
    getLifetimeStats().then(setLifetimeStats);
  }, []);
  const { notify: notifyVisualMatch, dialog: visualMatchDialog } = useVisualMatchAlert();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Turning it off never disrupts anyone, so that happens immediately -
  // only turning it ON (which boots every non-admin out mid-session, see
  // App.jsx) asks for confirmation first, with a headcount so the admin
  // knows the blast radius before committing.
  async function handleToggleMaintenance() {
    setMaintenanceError('');
    if (maintenanceMode) {
      setMaintenanceSaving(true);
      try {
        await setMaintenanceMode(false);
      } catch (err) {
        setMaintenanceError(getErrorMessage(err));
      } finally {
        setMaintenanceSaving(false);
      }
      return;
    }

    let activeCount = 0;
    try {
      const users = await listUsers();
      activeCount = users.filter(
        (u) => u.id !== user.uid && u.lastLoginAt && Date.now() - u.lastLoginAt.toMillis() < MAINTENANCE_ACTIVE_WINDOW_MS
      ).length;
    } catch {
      // A failed headcount isn't worth blocking the toggle over - the
      // confirmation still makes sense without it, just less specific.
    }
    const ok = await confirm(
      activeCount > 0
        ? `${activeCount} משתמשים פתחו את האפליקציה ב-30 הדקות האחרונות ויועפו החוצה מיד למסך תחזוקה. להפעיל בכל זאת?`
        : 'לא נראה שמישהו השתמש באפליקציה ב-30 הדקות האחרונות. להפעיל מצב תחזוקה?',
      { confirmLabel: 'הפעלת תחזוקה', danger: true }
    );
    if (!ok) return;
    setMaintenanceSaving(true);
    try {
      await setMaintenanceMode(true);
    } catch (err) {
      setMaintenanceError(getErrorMessage(err));
    } finally {
      setMaintenanceSaving(false);
    }
  }

  async function handleRescanAll() {
    setRescanning(true);
    setRescanResult(null);
    setRescanError('');
    setRescanProgress({ done: 0, total: 0 });
    try {
      const result = await rescanAllLostCases((done, total) => setRescanProgress({ done, total }));
      setRescanResult(result);
      notifyVisualMatch(result.visualMatches);
    } catch (err) {
      setRescanError(getErrorMessage(err));
    } finally {
      setRescanning(false);
    }
  }

  async function handlePhotoBackfill() {
    setPhotoBackfilling(true);
    setPhotoBackfillResult(null);
    setPhotoBackfillError('');
    setPhotoBackfillProgress({ done: 0, total: 0 });
    try {
      const result = await backfillPhotoSimilarityForExistingMatches((done, total) =>
        setPhotoBackfillProgress({ done, total })
      );
      setPhotoBackfillResult(result);
      notifyVisualMatch(result.visualMatches);
    } catch (err) {
      setPhotoBackfillError(getErrorMessage(err));
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
    setArchiveError('');
    try {
      const counts = await countOldActiveRecords(new Date(archiveCutoffDate));
      setArchivePreview({ cutoffDate: archiveCutoffDate, ...counts });
    } catch (err) {
      setArchiveError(getErrorMessage(err));
    } finally {
      setPreviewing(false);
    }
  }

  function handleCutoffDateChange(value) {
    setArchiveCutoffDate(value);
    setArchivePreview(null);
  }

  async function handleConfirmArchive() {
    const total = archivePreview.lostCats + archivePreview.lostDogs + archivePreview.foundCats + archivePreview.foundDogs;
    const ok = await confirm(
      `למחוק לצמיתות ${total} רשומות (${archivePreview.lostCats + archivePreview.lostDogs} תיקי חיפוש, ${archivePreview.foundCats + archivePreview.foundDogs} דיווחים)? כולל התמונות וההתאמות שלהן - לא ניתן לשחזר. המספרים הכוללים ("כמה דווחו/הוחזרו אי-פעם") לא נפגעים - אלו נשמרים בנפרד.`,
      { confirmLabel: 'מחיקה לצמיתות', danger: true }
    );
    if (!ok) return;
    setArchiving(true);
    setArchiveError('');
    setArchiveProgress({ done: 0, total: 0 });
    try {
      const result = await archiveOldRecords(new Date(archivePreview.cutoffDate), (done, total) => setArchiveProgress({ done, total }));
      setArchiveResult(result);
      setArchivePreview(null);
    } catch (err) {
      setArchiveError(getErrorMessage(err));
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

        <button
          type="button"
          onClick={() => setShowOnboardingPreview(true)}
          className="flex w-full items-center justify-between p-4 text-right hover:bg-slate-50"
        >
          <span className="font-medium text-slate-700">תצוגה מקדימה של מסך הכניסה הראשונה</span>
          <span className="text-slate-400">‹</span>
        </button>

        <button type="button" onClick={signOut} className="w-full p-4 text-right font-medium text-red-600">
          התנתקות
        </button>
      </nav>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={handleToggleMaintenance}
          disabled={maintenanceSaving}
          className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-right transition disabled:opacity-50 ${
            maintenanceMode ? 'border-amber-300 bg-amber-50' : 'border-transparent bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="w-7 shrink-0 text-center text-lg">🚧</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">מצב תחזוקה</p>
              <p className="text-xs text-slate-500">
                {maintenanceMode
                  ? 'פעיל - משתמשים רגילים רואים מסך תחזוקה, אתם ממשיכים לראות הכל'
                  : 'כבוי - האפליקציה פתוחה לכולם'}
              </p>
            </div>
          </div>
          <span className={`shrink-0 text-xs font-bold ${maintenanceMode ? 'text-amber-700' : 'text-slate-400'}`}>
            {maintenanceSaving ? '...' : maintenanceMode ? 'פעיל' : 'כבוי'}
          </span>
        </button>
        {maintenanceError && <p className="mt-2 text-sm font-medium text-red-600">{maintenanceError}</p>}
      </section>

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
        {rescanning && <ProgressBar current={rescanProgress.done} total={rescanProgress.total} label="סורק מחדש..." />}
        {rescanResult && (
          <p className="mt-2 text-sm text-emerald-700">
            נסרקו מחדש {rescanResult.casesProcessed} תיקי חיפוש, נמצאו {rescanResult.matchesScored} התאמות בסך הכל.
          </p>
        )}
        {rescanError && <p className="mt-2 text-sm font-medium text-red-600">{rescanError}</p>}
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
        {photoBackfilling && <ProgressBar current={photoBackfillProgress.done} total={photoBackfillProgress.total} label="משווה תמונות..." />}
        {photoBackfillResult && (
          <p className="mt-2 text-sm text-emerald-700">
            נסרקו {photoBackfillResult.casesScanned} תיקי חיפוש, הושוו תמונות ב-{photoBackfillResult.pairsChecked}{' '}
            התאמות.
            {(photoBackfillResult.skippedBelowThreshold > 0 ||
              photoBackfillResult.skippedClosed > 0 ||
              photoBackfillResult.skippedOverCap > 0) && (
              <>
                {' '}
                <span className="text-slate-500">
                  ({photoBackfillResult.skippedBelowThreshold} מתחת לסף לפי הציון העדכני
                  {photoBackfillResult.skippedClosed > 0 && `, ${photoBackfillResult.skippedClosed} בתיקים לא פעילים`}
                  {photoBackfillResult.skippedOverCap > 0 &&
                    `, ${photoBackfillResult.skippedOverCap} מעל מקסימום ההשוואות לתיק (ריצה נוספת תבדוק אותן)`}{' '}
                  - לא נבדקו)
                </span>
              </>
            )}
          </p>
        )}
        {photoBackfillError && <p className="mt-2 text-sm font-medium text-red-600">{photoBackfillError}</p>}
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-medium text-slate-700">מחיקת רשומות ישנות</h2>
        <p className="mb-3 text-sm text-slate-500">
          מוחק לצמיתות כל תיק חיפוש ודיווח פעילים (חתולים וכלבים) שנוצרו לפני התאריך שנבחר ומעולם לא נסגרו - כולל
          התמונות שלהם וההתאמות שנמצאו עבורם. לא הופך אותם לארכיון: הם נעלמים לגמרי, בדיוק כמו "מחיקת התיק"/"מחיקת
          הדיווח" הידניים, רק בכל הרשומות הישנות יחד. רשומה שכבר נסגרה בדרך אמיתית (נמצאה, הוחזרה, נפטרה) לא נוגעים
          בה כאן בכלל - היא ממשיכה להופיע בעמוד הארכיון כרגיל. התהליך הזה רץ גם אוטומטית, פעם בשבוע (יום ראשון), בלי
          צורך להריץ אותו ידנית.
        </p>

        {lifetimeStats && (
          <div className="mb-4 rounded-xl bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium text-slate-600">
              מספרים כוללים לביקורת (לא נפגעים ממחיקה - נשמרים לצמיתות מרגע הדיווח/ההחזרה):
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-slate-400">דווחו כאבודים</p>
                <p className="font-semibold text-slate-800">
                  {lifetimeStats.lostReportedCat} חתולים · {lifetimeStats.lostReportedDog} כלבים
                </p>
              </div>
              <div>
                <p className="text-slate-400">דווחו כנראו/נמצאו</p>
                <p className="font-semibold text-slate-800">
                  {lifetimeStats.foundReportedCat} חתולים · {lifetimeStats.foundReportedDog} כלבים
                </p>
              </div>
              <div>
                <p className="text-slate-400">הותאמו/הוחזרו לבעלים</p>
                <p className="font-semibold text-slate-800">
                  {lifetimeStats.matchedToOwnerCat} חתולים · {lifetimeStats.matchedToOwnerDog} כלבים
                </p>
              </div>
            </div>
          </div>
        )}

        <label className="mb-3 block text-sm text-slate-600">
          תיקים ודיווחים שנוצרו לפני תאריך זה יימחקו לצמיתות
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
              נמצאו למחיקה: <strong>{archivePreview.lostCats + archivePreview.lostDogs}</strong> תיקי חיפוש (
              {archivePreview.lostCats} חתולים, {archivePreview.lostDogs} כלבים) ו-
              <strong>{archivePreview.foundCats + archivePreview.foundDogs}</strong> דיווחים ({archivePreview.foundCats}{' '}
              חתולים, {archivePreview.foundDogs} כלבים).
            </p>
            {archivePreview.lostCats + archivePreview.lostDogs + archivePreview.foundCats + archivePreview.foundDogs === 0 ? (
              <button type="button" onClick={() => setArchivePreview(null)} className="text-sm text-slate-500 underline">
                אין מה למחוק - סגירה
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmArchive}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white"
                >
                  מחיקה לצמיתות
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

        {archiving && <ProgressBar current={archiveProgress.done} total={archiveProgress.total} label="מוחק..." />}
        {archiveResult && (
          <p className="mt-2 text-sm text-emerald-700">
            נמחקו לצמיתות {archiveResult.lostCasesArchived} תיקי חיפוש ו-{archiveResult.foundReportsArchived} דיווחים.
          </p>
        )}
        {archiveError && <p className="mt-2 text-sm font-medium text-red-600">{archiveError}</p>}
      </section>

      <AppFooter />
      {visualMatchDialog}
      {confirmDialog}
      {showOnboardingPreview && <OnboardingDialog onClose={() => setShowOnboardingPreview(false)} />}
    </div>
  );
}
