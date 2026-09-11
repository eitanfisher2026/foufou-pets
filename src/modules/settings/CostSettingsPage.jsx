import { useEffect, useState } from 'react';
import { collection, getAggregateFromServer, getCountFromServer, sum } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';
import BackLink from '../shared/BackLink.jsx';
import { listUserCosts, getMonthlyFlagThreshold, setMonthlyFlagThreshold, DEFAULT_MONTHLY_FLAG_THRESHOLD_USD } from './userCostsApi.js';
import { listUsers } from '../users/usersApi.js';

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

export default function CostSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [userCosts, setUserCosts] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [threshold, setThreshold] = useState(DEFAULT_MONTHLY_FLAG_THRESHOLD_USD);
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_MONTHLY_FLAG_THRESHOLD_USD));
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Server-side sum/count aggregations, not a full read of every record -
  // this page used to fetch every lost case and found report in full just
  // to add up two or three numeric fields client-side. A sum/count
  // aggregation query computes the total on Firestore's own side and
  // transfers back only the result, regardless of how many documents it's
  // summing over - the real fix for "reads the entire collection just to
  // show a handful of totals", not just a smaller page size.
  useEffect(() => {
    const lostCasesRef = collection(db, COLLECTIONS.LOST_CASES);
    const foundReportsRef = collection(db, COLLECTIONS.FOUND_REPORTS);
    Promise.all([
      getAggregateFromServer(lostCasesRef, { aiCost: sum('aiCostUsd'), visualMatchCost: sum('visualMatchCostUsd') }),
      getAggregateFromServer(foundReportsRef, { aiCost: sum('aiCostUsd') }),
      getCountFromServer(lostCasesRef),
      getCountFromServer(foundReportsRef),
      listUserCosts(),
      listUsers(),
      getMonthlyFlagThreshold(),
    ]).then(([lostAgg, foundAgg, lostCount, foundCount, costsByUser, users, monthlyThreshold]) => {
      setStats({
        lostAiCost: lostAgg.data().aiCost || 0,
        foundAiCost: foundAgg.data().aiCost || 0,
        visualMatchCost: lostAgg.data().visualMatchCost || 0,
        recordCount: (lostCount.data().count || 0) + (foundCount.data().count || 0),
      });
      setUserCosts(costsByUser);
      setUsersById(Object.fromEntries(users.map((u) => [u.id, u])));
      setThreshold(monthlyThreshold);
      setThresholdInput(String(monthlyThreshold));
      setLoading(false);
    });
  }, []);

  async function handleSaveThreshold() {
    const value = Number(thresholdInput);
    if (!Number.isFinite(value) || value < 0) return;
    setSavingThreshold(true);
    try {
      await setMonthlyFlagThreshold(value);
      setThreshold(value);
    } finally {
      setSavingThreshold(false);
    }
  }

  if (loading || !stats) return <p className="p-4 text-slate-500">טוען...</p>;

  const perUserRows = userCosts
    .map((c) => {
      const u = usersById[c.id];
      const currentMonthCostUsd = c.currentMonthCostUsd || 0;
      return {
        id: c.id,
        email: u?.email || '',
        displayName: u?.displayName || '',
        lifetimeCostUsd: (c.aiCostUsd || 0) + (c.visualMatchCostUsd || 0),
        currentMonthCostUsd,
        flagged: currentMonthCostUsd >= threshold,
      };
    })
    .sort((a, b) => b.lifetimeCostUsd - a.lifetimeCostUsd);

  const totalAiCost = stats.lostAiCost + stats.foundAiCost + stats.visualMatchCost;
  const estimatedPhotos = stats.recordCount * ASSUMED_PHOTOS_PER_RECORD;
  const estimatedStorageGB = (estimatedPhotos * ASSUMED_KB_PER_PHOTO) / (1024 * 1024);
  const storageOverageGB = Math.max(0, estimatedStorageGB - FREE_STORAGE_GB);
  const estimatedStorageCost = storageOverageGB * STORAGE_PRICE_PER_GB_MONTH;

  return (
    <div className="p-4 pb-10">
      <BackLink to="/settings">חזרה להגדרות</BackLink>
      <h1 className="mb-1 text-xl font-bold text-slate-800">עלויות</h1>
      <p className="mb-6 text-sm text-slate-500">
        עלות ה-AI מבוססת על צריכת הטוקנים האמיתית שדווחה בכל קריאה בפועל - לא הערכה. עלות Firebase היא הערכה גסה בלבד,
        ראו הסבר למטה. שתיהן מחושבות רק על רשומות קיימות כרגע - רשומות ישנות שנמחקו (ראו "מחיקת רשומות ישנות") כבר לא
        נכללות.
      </p>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">עלות AI</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">תיקי חיפוש (זיהוי מצילומי מסך)</span>
            <span className="font-medium text-slate-800">{formatUsd(stats.lostAiCost)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">דיווחים (זיהוי מצילומי מסך)</span>
            <span className="font-medium text-slate-800">{formatUsd(stats.foundAiCost)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">השוואת תמונות בהתאמות</span>
            <span className="font-medium text-slate-800">{formatUsd(stats.visualMatchCost)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold">
            <span className="text-slate-700">סה"כ עלות AI</span>
            <span className="text-slate-900">{formatUsd(totalAiCost)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          זיהוי מצילומי מסך: קריאה אחת לכל דיווח בזמן ההעלאה (כולל סריקות חוזרות). בדיקת ההתאמות (matching) עצמה
          דטרמיניסטית וחינמית על שדות מובנים - "השוואת תמונות בהתאמות" היא היוצא מן הכלל היחיד: קריאת AI שרצה רק על
          התאמות שכבר עברו את סף הסבירות שנבחר ב"פרמטרים להתאמה", לא על כל זוג.
        </p>
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-700">עלות לפי משתמש</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>סימון מעל</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="input w-16 text-center"
            />
            <span>$ בחודש</span>
            <button
              type="button"
              onClick={handleSaveThreshold}
              disabled={savingThreshold || Number(thresholdInput) === threshold}
              className="rounded-lg bg-slate-800 px-2 py-1 font-medium text-white disabled:opacity-40"
            >
              {savingThreshold ? 'שומר...' : 'שמירה'}
            </button>
          </div>
        </div>

        {perUserRows.length === 0 ? (
          <p className="text-sm text-slate-400">אף משתמש עדיין לא הפעיל תהליך AI (זיהוי מצילום מסך או השוואת תמונות).</p>
        ) : (
          <ul className="space-y-2">
            {perUserRows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">
                    {row.flagged && <span className="ml-1">⚠️</span>}
                    {row.displayName || row.email || row.id}
                  </p>
                  {row.email && row.displayName && <p className="truncate text-xs text-slate-400">{row.email}</p>}
                </div>
                <div className="shrink-0 text-left">
                  <p className="font-medium text-slate-800">{formatUsd(row.lifetimeCostUsd)}</p>
                  <p className="text-xs text-slate-400">{formatUsd(row.currentMonthCostUsd)} החודש</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-400">
          עלות AI בלבד (לא כוללת אחסון). "החודש" מתאפס בתחילת כל חודש קלנדרי. משתמש עם ⚠️ חרג מהסכום שנקבע מעלה
          החודש הנוכחי - שווה לבדוק שהשימוש שלו תקין.
        </p>
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
