import { PAUSE_DEFAULT_MESSAGE } from './maintenanceApi.js';

/**
 * Full-screen "app is offline" message shown to non-admins while either
 * maintenance mode or the full system pause is on (see useMaintenanceMode.js).
 * An admin never sees this once signed in (see App.jsx). During a pause a
 * signed-out visitor sees it too, so it also offers a way in for the admin
 * to switch things back on.
 */
export default function MaintenanceScreen({ paused, message, onSignOut, onSignIn }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-amber-50 px-6 text-center">
      <div className="text-5xl">{paused ? '⏸️' : '🚧'}</div>
      <h1 className="text-2xl font-bold text-slate-800">{paused ? 'המערכת מושהית זמנית' : 'רגע של תחזוקה'}</h1>
      <p className="max-w-xs whitespace-pre-line text-sm text-slate-500">
        {paused ? message || PAUSE_DEFAULT_MESSAGE : 'אנחנו מעדכנים את האפליקציה. נחזור לפעילות בקרוב - נסו שוב בעוד כמה דקות.'}
      </p>
      {onSignOut && (
        <button type="button" onClick={onSignOut} className="mt-2 text-xs text-slate-400 underline">
          התנתקות
        </button>
      )}
      {onSignIn && (
        <button type="button" onClick={onSignIn} className="mt-6 text-[11px] text-slate-300 underline">
          כניסת מנהל
        </button>
      )}
    </div>
  );
}
