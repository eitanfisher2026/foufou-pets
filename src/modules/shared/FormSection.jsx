/**
 * Groups related form fields under a bordered, collapsible box (native
 * <details>/<summary>) with the section title as the toggle, used
 * identically across every lost/found create and edit form so the same
 * four sections (cat details, last seen, contact, source) always look and
 * order the same way no matter which screen you're on. Open by default -
 * pass `defaultOpen={false}` for a section that should start collapsed.
 */
export default function FormSection({ title, children, defaultOpen = true }) {
  return (
    <details className="rounded-xl border border-dotted border-slate-400 p-4" open={defaultOpen}>
      <summary className="cursor-pointer px-2 text-sm font-bold text-slate-700">{title}</summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
