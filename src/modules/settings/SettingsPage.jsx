import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import BackLink from '../shared/BackLink.jsx';
import { rescanAllLostCases, backfillPhotoSimilarityForExistingMatches } from '../matching/matchingApi.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { CONFIDENCE_BUCKETS } from '../matching/matchingEngine.js';
import { useVisualMatchAlert } from '../shared/useVisualMatchAlert.jsx';
import AppFooter from '../shared/AppFooter.jsx';

function photoThresholdLabel(key) {
  if (key === 'never') return 'כבוי';
  return CONFIDENCE_BUCKETS.find((b) => b.key === key)?.label || key;
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
          בלי לאפס או לסרוק מחדש שום דבר אחר - עובר על ההתאמות הקיימות של כל תיק חיפוש פעיל, ולכל התאמה שכבר עוברת
          את סף הסבירות שהוגדר ב"פרמטרים להתאמה" אבל עדיין לא עברה השוואת תמונות, מריץ אותה עכשיו. שימושי אחרי
          שהפעלתם את הפיצ'ר הזה לראשונה או שינתם את הסף, כדי שגם התאמות שכבר נבדקו יקבלו את הבדיקה החזותית.
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
          </p>
        )}
      </section>

      <AppFooter />
      {visualMatchDialog}
    </div>
  );
}
