import { useEffect, useState } from 'react';
import BackLink from '../shared/BackLink.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listUsers, updateUserRole, deleteUser, clearUserReference, ROLES, ROLE_LABELS } from '../users/usersApi.js';
import { formatDateTime } from '../shared/formatDateTime.js';
import SelectField from '../shared/SelectField.jsx';
import { useConfirm } from '../shared/useConfirm.jsx';
import { getErrorMessage } from '../shared/errorMessages.js';

const ROLE_OPTIONS = Object.values(ROLES).map((role) => ({ value: role, label: ROLE_LABELS[role] }));

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
  const [disconnectingUid, setDisconnectingUid] = useState(null);
  const [clearingUid, setClearingUid] = useState(null);
  // Keyed by uid, so the "done, N cleared" confirmation stays attached to
  // whichever row it's actually about, even after clearing several people
  // in a row.
  const [clearedResults, setClearedResults] = useState({});
  // Keyed by uid too, same reasoning as clearedResults - a failed action on
  // one person's row shouldn't get lost or misread as being about another.
  const [actionErrors, setActionErrors] = useState({});
  const { confirm, dialog } = useConfirm();

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
    setActionErrors((prev) => ({ ...prev, [uid]: '' }));
    try {
      await updateUserRole(uid, role);
      setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, role } : u)));
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [uid]: getErrorMessage(err) }));
    } finally {
      setSavingUid(null);
    }
  }

  // Fulfills the actual deletion right described in the privacy policy
  // (public/privacy.html, section 5) - unlike "ניתוק" below, this doesn't
  // touch their account/login at all; it clears their name/email/phone off
  // every lost case and found report they created, and their name/email on
  // every feedback thread they sent, leaving the records themselves (and
  // their ability to keep using the app) untouched. The two actions answer
  // different questions ("delete my personal info" vs. "remove my access")
  // and either one alone doesn't do the other.
  async function handleClearReference(u) {
    const ok = await confirm(
      `לנקות את פרטי הקשר של ${u.displayName || u.email} מהמערכת? השם, האימייל והטלפון שלהם יימחקו מכל תיק חיפוש, דיווח ופנייה שיצרו - אבל התיקים והדיווחים עצמם (תמונות, פרטי החיה, התאמות) יישארו. זה לא מנתק אותם ולא חוסם אותם מהאפליקציה - רק פעולת "ניתוק" למטה עושה את זה.`,
      { confirmLabel: 'ניקוי פרטים אישיים', danger: true }
    );
    if (!ok) return;
    setClearingUid(u.id);
    setActionErrors((prev) => ({ ...prev, [u.id]: '' }));
    try {
      const result = await clearUserReference(u.id);
      setClearedResults((prev) => ({ ...prev, [u.id]: result }));
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [u.id]: getErrorMessage(err) }));
    } finally {
      setClearingUid(null);
    }
  }

  // Removes their profile doc entirely - drops them straight to REGULAR if
  // they're mid-session right now, and back to a brand-new REGULAR profile
  // if they ever sign in again (see deleteUser in usersApi.js). Doesn't
  // block them from using the app going forward - there's no "banned"
  // state here, only a reset - so the confirmation spells that out instead
  // of implying this is a permanent ban.
  async function handleDisconnect(u) {
    const ok = await confirm(
      `לנתק את ${u.displayName || u.email}? הפרופיל שלהם יימחק - אם הם עורך/ת או מנהל/ת, התפקיד יאופס מיד. זה לא חוסם אותם: אם יתחברו שוב, ייווצר להם פרופיל רגיל חדש, בדיוק כמו משתמש/ת חדש/ה.`,
      { confirmLabel: 'ניתוק', danger: true }
    );
    if (!ok) return;
    setDisconnectingUid(u.id);
    setActionErrors((prev) => ({ ...prev, [u.id]: '' }));
    try {
      await deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [u.id]: getErrorMessage(err) }));
    } finally {
      setDisconnectingUid(null);
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
              <SelectField
                className="w-32 text-sm"
                label="בחירת תפקיד"
                allowClear={false}
                value={u.role || ROLES.REGULAR}
                disabled={savingUid === u.id || u.id === currentUser.uid}
                onChange={(v) => handleRoleChange(u.id, v)}
                options={ROLE_OPTIONS}
              />
            </div>
            {u.id === currentUser.uid ? (
              <p className="mt-1 text-xs text-slate-400">זה אתה - לא ניתן לשנות או לנתק את עצמך</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleClearReference(u)}
                  disabled={clearingUid === u.id}
                  className="text-xs text-red-600 underline disabled:opacity-50"
                >
                  {clearingUid === u.id ? 'מנקה...' : 'ניקוי התייחסות'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDisconnect(u)}
                  disabled={disconnectingUid === u.id}
                  className="text-xs text-red-600 underline disabled:opacity-50"
                >
                  {disconnectingUid === u.id ? 'מנתק...' : 'ניתוק'}
                </button>
              </div>
            )}
            {clearedResults[u.id] && (
              <p className="mt-1 text-xs text-emerald-700">
                נוקו {clearedResults[u.id].lostCasesCleared} תיקי חיפוש, {clearedResults[u.id].foundReportsCleared} דיווחים
                {clearedResults[u.id].feedbackThreadsCleared > 0 && `, ${clearedResults[u.id].feedbackThreadsCleared} פניות משוב`}.
              </p>
            )}
            {actionErrors[u.id] && <p className="mt-1 text-xs font-medium text-red-600">{actionErrors[u.id]}</p>}
          </li>
        ))}
      </ul>

      {dialog}
    </div>
  );
}
