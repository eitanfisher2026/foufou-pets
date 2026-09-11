import { useEffect, useState } from 'react';
import { collection, getAggregateFromServer, getCountFromServer, sum } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';
import BackLink from '../shared/BackLink.jsx';
import {
  listUserCosts,
  getMonthlyFlagThresholds,
  setMonthlyFlagThresholds,
  DEFAULT_REGULAR_MONTHLY_FLAG_THRESHOLD_USD,
  DEFAULT_EDITOR_MONTHLY_FLAG_THRESHOLD_USD,
} from './userCostsApi.js';
import { listUsers, ROLES, ROLE_LABELS } from '../users/usersApi.js';

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
  const [thresholds, setThresholds] = useState({
    [ROLES.REGULAR]: DEFAULT_REGULAR_MONTHLY_FLAG_THRESHOLD_USD,
    [ROLES.EDITOR]: DEFAULT_EDITOR_MONTHLY_FLAG_THRESHOLD_USD,
  });
  const [thresholdInputs, setThresholdInputs] = useState({
    [ROLES.REGULAR]: String(DEFAULT_REGULAR_MONTHLY_FLAG_THRESHOLD_USD),
    [ROLES.EDITOR]: String(DEFAULT_EDITOR_MONTHLY_FLAG_THRESHOLD_USD),
  });
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Server-side sum/count aggregations, not a full read of every record -
  // this page used to fetch every lost case and found report in full just
  // to add up two or three numeric fields client-side. A sum/count
  // aggregation query computes the total on Firestore's own side and
  // transfers back only the result, regardless of how many documents it's
  // summing over - the real fix for "reads the entire collection just to
  // show a handful of totals", not just a smaller page size.
  //
  // aiCostUsd and visualMatchCostUsd are summed in two SEPARATE aggregation
  // queries against lostCases, not combined into one - Firestore only
  // auto-covers a single-field sum() with that field's own default index;
  // summing two different fields in the same query needs an explicit
  // composite index, which this project doesn't have (that's exactly the
  // "requires an index" crash this page was hitting on every load).
  useEffect(() => {
    const lostCasesRef = collection(db, COLLECTIONS.LOST_CASES);
    const foundReportsRef = collection(db, COLLECTIONS.FOUND_REPORTS);
    Promise.all([
      getAggregateFromServer(lostCasesRef, { aiCost: sum('aiCostUsd') }),
      getAggregateFromServer(lostCasesRef, { visualMatchCost: sum('visualMatchCostUsd') }),
      getAggregateFromServer(foundReportsRef, { aiCost: sum('aiCostUsd') }),
      getCountFromServer(lostCasesRef),
      getCountFromServer(foundReportsRef),
      listUserCosts(),
      listUsers(),
      getMonthlyFlagThresholds(),
    ]).then(([lostAiAgg, lostVisualAgg, foundAgg, lostCount, foundCount, costsByUser, users, monthlyThresholds]) => {
      setStats({
        lostAiCost: lostAiAgg.data().aiCost || 0,
        foundAiCost: foundAgg.data().aiCost || 0,
        visualMatchCost: lostVisualAgg.data().visualMatchCost || 0,
        recordCount: (lostCount.data().count || 0) + (foundCount.data().count || 0),
      });
      setUserCosts(costsByUser);
      setUsersById(Object.fromEntries(users.map((u) => [u.id, u])));
      setThresholds(monthlyThresholds);
      setThresholdInputs({
        [ROLES.REGULAR]: String(monthlyThresholds[ROLES.REGULAR]),
        [ROLES.EDITOR]: String(monthlyThresholds[ROLES.EDITOR]),
      });
      setLoading(false);
    });
  }, []);

  async function handleSaveThresholds() {
    const regular = Number(thresholdInputs[ROLES.REGULAR]);
    const editor = Number(thresholdInputs[ROLES.EDITOR]);
    if (!Number.isFinite(regular) || regular < 0 || !Number.isFinite(editor) || editor < 0) return;
    setSavingThreshold(true);
    try {
      await setMonthlyFlagThresholds({ regular, editor });
      setThresholds({ [ROLES.REGULAR]: regular, [ROLES.EDITOR]: editor });
    } finally {
      setSavingThreshold(false);
    }
  }

  if (loading || !stats) return <p className="p-4 text-slate-500">טוען...</p>;

  const thresholdsUnchanged =
    Number(thresholdInputs[ROLES.REGULAR]) === thresholds[ROLES.REGULAR] &&
    Number(thresholdInputs[ROLES.EDITOR]) === thresholds[ROLES.EDITOR];

  // Admins have no threshold at all - never flagged, regardless of spend
  // (same trust boundary enforceAiRateLimit already draws in functions/
  // index.js). A role without its own threshold (a missing/legacy role
  // value) falls back to the regular threshold, the more cautious default.
  const perUserRows = userCosts
    .map((c) => {
      const u = usersById[c.id];
      const role = u?.role || ROLES.REGULAR;
      const currentMonthCostUsd = c.currentMonthCostUsd || 0;
      const roleThreshold = role === ROLES.ADMIN ? Infinity : thresholds[role] ?? thresholds[ROLES.REGULAR];
      return {
        id: c.id,
        email: u?.email || '',
        displayName: u?.displayName || '',
        role,
        lifetimeCostUsd: (c.aiCostUsd || 0) + (c.visualMatchCostUsd || 0),
        currentMonthCostUsd,
        flagged: currentMonthCostUsd >= roleThreshold,
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
        <h2 className="mb-3 text-lg font-semibold text-slate-700">עלות לפי משתמש</h2>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <label className="flex flex-col gap-1">
            <span>סימון מעל ($ בחודש) - משתמשים רגילים</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={thresholdInputs[ROLES.REGULAR]}
              onChange={(e) => setThresholdInputs((prev) => ({ ...prev, [ROLES.REGULAR]: e.target.value }))}
              className="input w-24"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>סימון מעל ($ בחודש) - עורכים</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={thresholdInputs[ROLES.EDITOR]}
              onChange={(e) => setThresholdInputs((prev) => ({ ...prev, [ROLES.EDITOR]: e.target.value }))}
              className="input w-24"
            />
          </label>
          <span className="flex flex-col gap-1 text-slate-400">
            <span>מנהלים</span>
            <span className="font-medium">ללא הגבלה</span>
          </span>
          <button
            type="button"
            onClick={handleSaveThresholds}
            disabled={savingThreshold || thresholdsUnchanged}
            className="rounded-lg bg-slate-800 px-3 py-1.5 font-medium text-white disabled:opacity-40"
          >
            {savingThreshold ? 'שומר...' : 'שמירה'}
          </button>
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
                  <p className="truncate text-xs text-slate-400">
                    {row.email && row.displayName ? `${row.email} · ` : ''}
                    {ROLE_LABELS[row.role] || row.role}
                  </p>
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
          עלות AI בלבד (לא כוללת אחסון). "החודש" מתאפס בתחילת כל חודש קלנדרי. משתמש עם ⚠️ חרג מהסף שנקבע לתפקיד שלו
          החודש הנוכחי - שווה לבדוק שהשימוש שלו תקין. לעורכים סף גבוה יותר כברירת מחדל, כי הם עושים באופן לגיטימי
          יותר פעולות AI מרוכזות (סריקה מחדש, עדכון השוואת תמונות); למנהלים אין סף כלל.
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
