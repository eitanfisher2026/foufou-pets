/**
 * One shared field wrapper used by every lost/found form and edit screen
 * (previously duplicated as a local component in each file). `inline` puts
 * the label and the control on one row - used for dropdowns and other
 * compact fields, where a full label-above-field stack wastes vertical
 * space for something the user just picks from a short list. The label
 * column is a fixed width (a CSS grid, not flex) specifically so every
 * inline field's control lines up at the same horizontal position across
 * rows regardless of how long that row's own label text happens to be -
 * with flex, a longer label like "מצב החתול" pushed its control further
 * left than a short one like "צבע", so the whole group looked staggered
 * instead of aligned.
 */
export default function Field({ label, children, inline = false }) {
  if (inline) {
    return (
      <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
        <label className="text-sm font-medium text-slate-600">{label}</label>
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
