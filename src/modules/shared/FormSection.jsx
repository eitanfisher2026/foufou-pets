/**
 * Groups related form fields under a bordered box with the section title
 * sitting on the border itself (a native <fieldset>/<legend>), used
 * identically across every lost/found create and edit form so the same
 * four sections (cat details, last seen, contact, source) always look and
 * order the same way no matter which screen you're on.
 */
export default function FormSection({ title, children }) {
  return (
    <fieldset className="rounded-xl border border-dotted border-slate-400 p-4">
      <legend className="px-2 text-sm font-bold text-slate-700">{title}</legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}
