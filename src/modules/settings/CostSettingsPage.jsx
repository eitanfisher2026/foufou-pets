import { useEffect, useState } from 'react';
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';
import BackLink from '../shared/BackLink.jsx';
import { getGlobalCosts, runCostTrackingMigration } from './userCostsApi.js';
import { getErrorMessage } from '../shared/errorMessages.js';

// Rough size assumption only, since actual file sizes aren't stored per
// photo - photos are compressed client-side to max 1280px / JPEG q0.75
// before upload (src/modules/shared/imageCompression.js), which typically
// lands well under this per photo, so this errs on the high side rather
// than understating cost.
const ASSUMED_KB_PER_PHOTO = 150;
// A record photo's own main photo plus, on average, roughly one more -
// used only to turn a cheap document count into a rough photo-count
// estimate (see estimatedPhotos below), not counted exactly per document -
// exact per-photo aggregation would need a stored count field this app
// doesn't keep, and isn't worth adding just for a number this page already
// treats as a rough, high-side estimate.
const ASSUMED_PHOTOS_PER_RECORD = 2;
const FREE_STORAGE_GB = 5;
const STORAGE_PRICE_PER_GB_MONTH = 0.026;

function formatUsd(n) {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

/**
 * Site-wide AI cost (total + this month) and a rough Firebase storage
 * estimate. The per-user cost breakdown lives on the users settings page
 * instead (see UsersSettingsPage.jsx) - alongside the role each person
 * already has there, which is what a per-user cost number is actually
 * judged against.
 */
export default function CostSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [recordCount, setRecordCount] = useState(0);
  const [globalCosts, setGlobalCosts] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState('');

  useEffect(() => {
    load();
  }, []);

  // recordCount (for the Firebase storage estimate) is still a server-side
  // count aggregation, not a full read - the AI cost figures below come
  // from config/costLedger instead of summing lostCases/foundReports fields
  // directly, so they no longer need an aggregation query at all (and the
  // "requires an index" crash that came with combining two summed fields in
  // one query is gone along with it).
  async function load() {
    const lostCasesRef = collection(db, COLLECTIONS.LOST_CASES);
    const foundReportsRef = collection(db, COLLECTIONS.FOUND_REPORTS);
    const [lostCount, foundCount, global] = await Promise.all([
      getCountFromServer(lostCasesRef),
      getCountFromServer(foundReportsRef),
      getGlobalCosts(),
    ]);
    setRecordCount((lostCount.data().count || 0) + (foundCount.data().count || 0));
    setGlobalCosts(global);
    setLoading(false);
  }

  async function handleMigrate() {
    setMigrating(true);
    setMigrationError('');
    try {
      await runCostTrackingMigration();
      await load();
    } catch (err) {
      setMigrationError(getErrorMessage(err));
    } finally {
      setMigrating(false);
    }
  }

  if (loading) return <p className="p-4 text-slate-500">טוען...</p>;

  const estimatedPhotos = recordCount * ASSUMED_PHOTOS_PER_RECORD;
  const estimatedStorageGB = (estimatedPhotos * ASSUMED_KB_PER_PHOTO) / (1024 * 1024);
  const storageOverageGB = Math.max(0, estimatedStorageGB - FREE_STORAGE_GB);
  const estimatedStorageCost = storageOverageGB * STORAGE_PRICE_PER_GB_MONTH;

  return (
    <div className="p-4 pb-10">
      <BackLink to="/settings">חזרה להגדרות</BackLink>
      <h1 className="mb-1 text-xl font-bold text-slate-800">עלויות</h1>
      <p className="mb-6 text-sm text-slate-500">
        עלות ה-AI מבוססת על צריכת הטוקנים האמיתית שדווחה בכל קריאה בפועל - לא הערכה. עלות Firebase היא הערכה גסה בלבד,
        ראו הסבר למטה. פירוט עלות לפי משתמש עבר לעמוד "ניהול משתמשים".
      </p>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">עלות AI</h2>

        {globalCosts === null ? (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p className="mb-2">
              המעקב עדיין לא עבר למודל החודשי (סך הכל + החודש הנוכחי בנפרד). לחיצה כאן תעביר את כל העלות שנצברה עד
              עכשיו לשדות "סך הכל", ותאפס את "החודש הנוכחי" (וגם את "החודש הנוכחי" של כל משתמש בעמוד "ניהול
              משתמשים") ל-0$ - פעולה חד-פעמית, לא ניתנת להרצה חוזרת.
            </p>
            <button
              type="button"
              onClick={handleMigrate}
              disabled={migrating}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {migrating ? 'מבצע...' : 'מעבר למעקב חודשי'}
            </button>
            {migrationError && <p className="mt-2 font-medium text-red-600">{migrationError}</p>}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">סך הכל</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">זיהוי מצילומי מסך</span>
                    <span className="font-medium text-slate-800">{formatUsd(globalCosts.aiCostUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">השוואת תמונות</span>
                    <span className="font-medium text-slate-800">{formatUsd(globalCosts.visualMatchCostUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold">
                    <span className="text-slate-700">סה"כ</span>
                    <span className="text-slate-900">{formatUsd(globalCosts.aiCostUsd + globalCosts.visualMatchCostUsd)}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">החודש הנוכחי</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">זיהוי מצילומי מסך</span>
                    <span className="font-medium text-slate-800">{formatUsd(globalCosts.currentMonthAiCostUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">השוואת תמונות</span>
                    <span className="font-medium text-slate-800">{formatUsd(globalCosts.currentMonthVisualMatchCostUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold">
                    <span className="text-slate-700">סה"כ</span>
                    <span className="text-slate-900">
                      {formatUsd(globalCosts.currentMonthAiCostUsd + globalCosts.currentMonthVisualMatchCostUsd)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              "החודש הנוכחי" מתאפס אוטומטית ב-1 בכל חודש (מה-1 ועד היום האחרון של החודש, כולל). זיהוי מצילומי מסך:
              קריאה אחת לכל דיווח בזמן ההעלאה (כולל סריקות חוזרות). השוואת תמונות רצה רק על התאמות שכבר עברו את סף
              הסבירות שנבחר ב"פרמטרים להתאמה" - ראו שם גם את התקרה למספר ההשוואות בסריקה אחת.
            </p>
          </>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">עלות Firebase (הערכה גסה)</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">תמונות משוערות</span>
            <span className="font-medium text-slate-800">{estimatedPhotos}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">אחסון משוער</span>
            <span className="font-medium text-slate-800">{estimatedStorageGB.toFixed(3)} GB</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold">
            <span className="text-slate-700">עלות אחסון משוערת</span>
            <span className="text-slate-900">{formatUsd(estimatedStorageCost)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          זו הערכה גסה יותר מבעבר: כדי לא לקרוא כל רשומה בנפרד, מספר התמונות עצמו הפך גם הוא להערכה - כ-
          {ASSUMED_PHOTOS_PER_RECORD} תמונות בממוצע לרשומה (במקום ספירה מדויקת), כפול כ-{ASSUMED_KB_PER_PHOTO}KB
          לתמונה (התמונות עצמן מכווצות לרזולוציה נמוכה-בינונית לפני ההעלאה, כך שזו הערכה שמרנית-כלפי-מעלה).{' '}
          {FREE_STORAGE_GB}GB הראשונים באחסון פטורים ממכסת החינם של Firebase. עלויות קריאה/כתיבה ב-Firestore לא
          נכללות כאן - בנפח השימוש הנוכחי הן כמעט בוודאות בתוך מכסת החינם היומית; לעלות מדויקת יש לבדוק ב-Firebase
          Console.
        </p>
      </section>
    </div>
  );
}
