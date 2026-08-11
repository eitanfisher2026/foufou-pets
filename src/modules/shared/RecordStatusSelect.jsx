import DropdownBadge from './DropdownBadge.jsx';

const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-amber-100 text-amber-800',
  archived: 'bg-slate-200 text-slate-600',
  resolved: 'bg-blue-100 text-blue-800',
};

/**
 * Status dropdown for a lost case or found report's own lifecycle (not the
 * per-match review status - see MATCH_STATUS_COLORS in LostCaseDetail.jsx
 * for that one). `labels` maps each RECORD_STATUS value to context-
 * appropriate Hebrew text, since "resolved" means something different for
 * a lost case (cat found) than a found report (cat returned to its owner).
 */
export default function RecordStatusSelect({ status, labels, onChange }) {
  return (
    <DropdownBadge value={status} labels={labels} onChange={onChange} colorClass={STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'} />
  );
}
