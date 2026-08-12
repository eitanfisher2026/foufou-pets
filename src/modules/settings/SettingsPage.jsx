import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import BackLink from '../shared/BackLink.jsx';
import { APP_VERSION } from '../../version.js';

export default function SettingsPage() {
  const { user, signOut } = useAuth();

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

      <p className="text-center text-xs text-slate-300">{APP_VERSION}</p>
    </div>
  );
}
