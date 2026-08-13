import { useEffect, useState } from 'react';
import BackLink from '../shared/BackLink.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listUsers, updateUserRole, ROLES, ROLE_LABELS } from '../users/usersApi.js';
import { formatDateTime } from '../shared/formatDateTime.js';

/**
 * Admin-only: everyone who has ever signed in, their role, and when they
 * last logged in. Role changes take effect immediately for that person
 * (AuthProvider listens to their own user doc live), no re-login needed.
 */
export default function UsersSettingsPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUid, setSavingUid] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const list = await listUsers();
    list.sort((a, b) => (b.lastLoginAt?.toMillis?.() || 0) - (a.lastLoginAt?.toMillis?.() || 0));
    setUsers(list);
    setLoading(false);
  }

  async function handleRoleChange(uid, role) {
    setSavingUid(uid);
    try {
      await updateUserRole(uid, role);
      setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, role } : u)));
    } finally {
      setSavingUid(null);
    }
  }

  return (
    <div className="p-4">
      <BackLink to="/settings">חזרה להגדרות</BackLink>
      <h1 className="mb-1 text-xl font-bold text-slate-800">ניהול משתמשים</h1>
      <p className="mb-6 text-sm text-slate-500">
        כל מי שהתחבר לאפליקציה פעם אחת לפחות. מנהל/ת יכול/ה לשנות תפקיד; רגיל/ה ועורך/ת לא רואים את עמוד ההגדרות
        בכלל.
      </p>

      {loading && <p className="text-slate-500">טוען...</p>}

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-3">
              {u.photoURL && (
                <img src={u.photoURL} alt="" className="h-10 w-10 shrink-0 rounded-full" referrerPolicy="no-referrer" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">{u.displayName || u.email}</p>
                <p className="truncate text-xs text-slate-500">{u.email}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                כניסה אחרונה: <span dir="ltr">{formatDateTime(u.lastLoginAt) || '—'}</span>
              </span>
              <select
                className="input w-32 text-sm"
                value={u.role || ROLES.REGULAR}
                disabled={savingUid === u.id || u.id === currentUser.uid}
                onChange={(e) => handleRoleChange(u.id, e.target.value)}
              >
                {Object.values(ROLES).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            {u.id === currentUser.uid && <p className="mt-1 text-xs text-slate-400">זה אתה - לא ניתן לשנות לעצמך</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
