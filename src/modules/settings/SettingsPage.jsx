import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import BackLink from '../shared/BackLink.jsx';
import { rescanAllLostCases } from '../matching/matchingApi.js';
import AppFooter from '../shared/AppFooter.jsx';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [rescanning, setRescanning] = useState(false);
  const [rescanProgress, setRescanProgress] = useState(null);
  const [rescanResult, setRescanResult] = useState(null);

  async function handleRescanAll() {
    setRescanning(true);
    setRescanResult(null);
    setRescanProgress({ done: 0, total: 0 });
    try {
      const result = await rescanAllLostCases((done, total) => setRescanProgress({ done, total }));
      setRescanResult(result);
    } finally {
      setRescanning(false);
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
          שההתאמות הקיימות ישקפו את הלוגיקה העדכנית ולא רק תיקים שמישהו פתח וסרק ידנית. יכול לקחת זמן אם יש הרבה
          תיקים.
        </p>
        <button
          type="button"
          onClick={handleRescanAll}
          disabled={rescanning}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
        >
          {rescanning ? 'סורק מחדש...' : 'הרצה'}
        </button>
        {rescanning && rescanProgress && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-800 transition-all duration-300"
                style={{
                  width: rescanProgress.total > 0 ? `${(rescanProgress.done / rescanProgress.total) * 100}%` : '0%',
                }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {rescanProgress.done} מתוך {rescanProgress.total} תיקים
            </p>
          </div>
        )}
        {rescanResult && (
          <p className="mt-2 text-sm text-emerald-700">
            נסרקו מחדש {rescanResult.casesProcessed} תיקי חיפוש, נמצאו {rescanResult.matchesScored} התאמות בסך הכל.
          </p>
        )}
      </section>

      <AppFooter />
    </div>
  );
}
