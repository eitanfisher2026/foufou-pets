/**
 * One shared field wrapper used by every lost/found form and edit screen
 * (previously duplicated as a local component in each file). `inline` puts
 * the label and the control on one row - used for dropdowns and other
 * compact fields, where a full label-above-field stack wastes vertical
 * space for something the user just picks from a short list.
 */
export default function Field({ label, children, inline = false }) {
  if (inline) {
    return (
      <div className="flex items-center gap-3">
        <label className="shrink-0 text-sm font-medium text-slate-600">{label}</label>
        {children}
      </div>
    );
  }
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
