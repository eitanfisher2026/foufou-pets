const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-amber-100 text-amber-800',
  archived: 'bg-slate-200 text-slate-600',
  resolved: 'bg-blue-100 text-blue-800',
};

/**
 * Status dropdown for a lost case or found report's own lifecycle (not the
 * per-match review status). Colored like a badge so the current status is
 * readable at a glance; changing it saves immediately. `labels` maps each
 * RECORD_STATUS value to context-appropriate Hebrew text, since "resolved"
 * means something different for a lost case (cat found) than a found report
 * (cat returned to its owner).
 */
export default function RecordStatusSelect({ status, labels, onChange }) {
  return (
    <select
      className={`max-w-full shrink-0 cursor-pointer rounded-full border border-black/10 px-3 py-1 text-xs font-semibold shadow-sm ${
        STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'
      }`}
      value={status}
      onChange={(e) => onChange(e.target.value)}
    >
      {Object.entries(labels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
