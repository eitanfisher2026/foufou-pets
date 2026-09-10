/**
 * Full-screen "app is offline" message shown to any signed-in non-admin
 * while config/maintenance.enabled is true (see useMaintenanceMode.js) -
 * an admin never sees this themselves (see App.jsx), so they can ship and
 * verify a change live under their own account first.
 */
export default function MaintenanceScreen({ onSignOut }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-amber-50 px-6 text-center">
      <div className="text-5xl">🚧</div>
      <h1 className="text-2xl font-bold text-slate-800">רגע של תחזוקה</h1>
      <p className="max-w-xs text-sm text-slate-500">
        אנחנו מעדכנים את האפליקציה. נחזור לפעילות בקרוב - נסו שוב בעוד כמה דקות.
      </p>
      <button type="button" onClick={onSignOut} className="mt-2 text-xs text-slate-400 underline">
        התנתקות
      </button>
    </div>
  );
}
