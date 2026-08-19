import { useEffect, useState } from 'react';
import BackLink from '../shared/BackLink.jsx';
import { listLostCases, listFoundReports } from '../dashboard/dashboardApi.js';

// Rough size assumption only, since actual file sizes aren't stored per
// photo - photos are compressed client-side to max 1280px / JPEG q0.75
// before upload (src/modules/shared/imageCompression.js), which typically
// lands well under this per photo, so this errs on the high side rather
// than understating cost.
const ASSUMED_KB_PER_PHOTO = 150;
const FREE_STORAGE_GB = 5;
const STORAGE_PRICE_PER_GB_MONTH = 0.026;

function formatUsd(n) {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

export default function CostSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [lostCases, setLostCases] = useState([]);
  const [foundReports, setFoundReports] = useState([]);

  useEffect(() => {
    Promise.all([listLostCases(), listFoundReports()]).then(([cases, reports]) => {
      setLostCases(cases);
      setFoundReports(reports);
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="p-4 text-slate-500">טוען...</p>;

  const lostAiCost = lostCases.reduce((sum, c) => sum + (c.aiCostUsd || 0), 0);
  const foundAiCost = foundReports.reduce((sum, r) => sum + (r.aiCostUsd || 0), 0);
  // Stored per lost case (see visualMatchCostUsd in matchingApi.js) since
  // every match doc lives under a lost case regardless of which side
  // triggered the check - found reports never carry this field.
  const visualMatchCost = lostCases.reduce((sum, c) => sum + (c.visualMatchCostUsd || 0), 0);
  const totalAiCost = lostAiCost + foundAiCost + visualMatchCost;

  const totalPhotos =
    lostCases.reduce((sum, c) => sum + (c.photos?.length || 0), 0) +
    foundReports.reduce((sum, r) => sum + (r.photos?.length || 0), 0);
  const estimatedStorageGB = (totalPhotos * ASSUMED_KB_PER_PHOTO) / (1024 * 1024);
  const storageOverageGB = Math.max(0, estimatedStorageGB - FREE_STORAGE_GB);
  const estimatedStorageCost = storageOverageGB * STORAGE_PRICE_PER_GB_MONTH;

  return (
    <div className="p-4 pb-10">
      <BackLink to="/settings">חזרה להגדרות</BackLink>
      <h1 className="mb-1 text-xl font-bold text-slate-800">עלויות</h1>
      <p className="mb-6 text-sm text-slate-500">
        עלות ה-AI מבוססת על צריכת הטוקנים האמיתית שדווחה בכל קריאה בפועל - לא הערכה. עלות Firebase היא הערכה גסה בלבד,
        ראו הסבר למטה.
      </p>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">עלות AI</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">תיקי חיפוש (זיהוי מצילומי מסך)</span>
            <span className="font-medium text-slate-800">{formatUsd(lostAiCost)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">דיווחים (זיהוי מצילומי מסך)</span>
            <span className="font-medium text-slate-800">{formatUsd(foundAiCost)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">השוואת תמונות בהתאמות</span>
            <span className="font-medium text-slate-800">{formatUsd(visualMatchCost)}</span>
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
        <h2 className="mb-3 text-lg font-semibold text-slate-700">עלות Firebase (הערכה גסה)</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">סה"כ תמונות שהועלו</span>
            <span className="font-medium text-slate-800">{totalPhotos}</span>
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
          זו הערכה בלבד: גודל כל תמונה לא נשמר בפועל, אז ההערכה מניחה כ-{ASSUMED_KB_PER_PHOTO}KB לתמונה בממוצע (התמונות
          עצמן מכווצות לרזולוציה נמוכה-בינונית לפני ההעלאה, כך שזו הערכה שמרנית-כלפי-מעלה). {FREE_STORAGE_GB}GB
          הראשונים באחסון פטורים ממכסת החינם של Firebase. עלויות קריאה/כתיבה ב-Firestore לא נכללות כאן - בנפח השימוש
          הנוכחי הן כמעט בוודאות בתוך מכסת החינם היומית; לעלות מדויקת יש לבדוק ב-Firebase Console.
        </p>
      </section>
    </div>
  );
}
