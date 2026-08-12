import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import BackLink from '../shared/BackLink.jsx';
import { useConfirm } from '../shared/useConfirm.jsx';
import { migrateLegacyFields } from './legacyFieldMigration.js';
import { migrateOwnershipAndTimestamps } from './ownershipMigration.js';
import { APP_VERSION } from '../../version.js';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { confirm, dialog } = useConfirm();
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState('');
  const [ownershipMigrating, setOwnershipMigrating] = useState(false);
  const [ownershipResult, setOwnershipResult] = useState('');

  async function handleMigrateLegacyFields() {
    const ok = await confirm(
      'להעביר תיאור צבע, זנב שעיר ופרטי מיקום ישנים אל תוך "סימנים מיוחדים" ו"שכונה" בכל הרשומות הקיימות? פעולה חד-פעמית, בטוחה להרצה גם פעמיים.',
      { confirmLabel: 'הרצת המיגרציה' }
    );
    if (!ok) return;
    setMigrating(true);
    setMigrationResult('');
    try {
      const { lostCases, foundReports } = await migrateLegacyFields();
      setMigrationResult(`הועברו ${lostCases} תיקי חיפוש ו-${foundReports} דיווחים.`);
    } finally {
      setMigrating(false);
    }
  }

  async function handleMigrateOwnership() {
    const ok = await confirm(
      'לסמן את כל התיקים והדיווחים הקיימים כשייכים אליך, עם תאריך יצירה/עדכון של היום, ולהפוך את המשתמש שלך למנהל/ת? פעולה חד-פעמית.',
      { confirmLabel: 'הרצת המיגרציה' }
    );
    if (!ok) return;
    setOwnershipMigrating(true);
    setOwnershipResult('');
    try {
      const { lostCases, foundReports } = await migrateOwnershipAndTimestamps(user);
      setOwnershipResult(`סומנו ${lostCases} תיקי חיפוש ו-${foundReports} דיווחים. הפכת למנהל/ת המערכת.`);
    } finally {
      setOwnershipMigrating(false);
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

        <div className="p-4">
          <button type="button" onClick={handleMigrateLegacyFields} disabled={migrating} className="font-medium text-slate-700 disabled:opacity-50">
            {migrating ? 'מריצים מיגרציה...' : 'מיגרציית שדות ישנים (תיאור צבע/זנב שעיר/מיקום)'}
          </button>
          {migrationResult && <p className="mt-2 text-xs text-slate-500">{migrationResult}</p>}
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={handleMigrateOwnership}
            disabled={ownershipMigrating}
            className="font-medium text-slate-700 disabled:opacity-50"
          >
            {ownershipMigrating ? 'מריצים מיגרציה...' : 'מיגרציית בעלות ותאריכים (רשומות ישנות)'}
          </button>
          {ownershipResult && <p className="mt-2 text-xs text-slate-500">{ownershipResult}</p>}
        </div>

        <button type="button" onClick={signOut} className="w-full p-4 text-right font-medium text-red-600">
          התנתקות
        </button>
      </nav>

      <p className="text-center text-xs text-slate-300">{APP_VERSION}</p>
      {dialog}
    </div>
  );
}
