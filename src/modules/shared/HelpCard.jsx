/**
 * One row in the help content (see helpContent.js) - an icon, a title, and
 * a short plain-language explanation. Shared between HelpDialog.jsx (both
 * tabs) and OnboardingDialog.jsx (the getting-started list only).
 */
export default function HelpCard({ icon, title, body }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-base">{icon}</div>
      <div className="min-w-0">
        <p className="mb-0.5 text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  );
}
