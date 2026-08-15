import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import BackLink from '../shared/BackLink.jsx';
import { backfillDisplayNames } from '../shared/displayNameBackfill.js';
import AppFooter from '../shared/AppFooter.jsx';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const result = await backfillDisplayNames();
      setBackfillResult(result);
    } finally {
      setBackfilling(false);
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
        <h2 className="mb-1 font-medium text-slate-700">מילוי שמות תצוגה חסרים</h2>
        <p className="mb-3 text-sm text-slate-500">
          לתיקים/דיווחים בלי שם שיש להם סימנים מיוחדים, ממלא שם ברירת מחדל לפי הסימנים (אותו אלגוריתם שכבר מציג היום
          כשאין שם) - לא נוגע בשם שכבר נקבע, ואפשר להריץ שוב בלי נזק.
        </p>
        <button
          type="button"
          onClick={handleBackfill}
          disabled={backfilling}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
        >
          {backfilling ? 'ממלא...' : 'הרצה'}
        </button>
        {backfillResult && (
          <p className="mt-2 text-sm text-emerald-700">
            מולאו {backfillResult.lostCount} תיקי חיפוש ו-{backfillResult.foundCount} דיווחים.
          </p>
        )}
      </section>

      <AppFooter />
    </div>
  );
}
