import { useState } from 'react';
import { CLOSURE_REASON, CLOSURE_REASON_LABELS } from './collections.js';
import SelectField from './SelectField.jsx';

const CLOSURE_OPTIONS = Object.values(CLOSURE_REASON).map((reason) => ({ value: reason, label: CLOSURE_REASON_LABELS[reason] }));

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Prompts for the closure date/reason/who/comment right at the moment a
 * case is marked archived or resolved, instead of leaving that to be
 * filled in later via the edit form - a case marked closed without this
 * ends up blank on the archive page, with no way to tell why or when it
 * closed. Also reused to revisit/correct an already-closed case's details
 * (opened from the same "ארכיון" action) - `initial*` props prefill from
 * whatever's already on the record instead of always starting blank.
 */
export default function ClosureDialog({
  initialDate = '',
  initialReason = '',
  initialClosedBy = '',
  initialComment = '',
  onConfirm,
  onCancel,
}) {
  const [closureDate, setClosureDate] = useState(initialDate || todayIso());
  const [closureReason, setClosureReason] = useState(initialReason);
  const [closedBy, setClosedBy] = useState(initialClosedBy);
  const [closingComment, setClosingComment] = useState(initialComment);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-bold text-slate-800">סגירת התיק</h2>

        <label className="mb-3 block text-sm text-slate-700">
          תאריך
          <input
            type="date"
            className="input mt-1 block w-full"
            value={closureDate}
            onChange={(e) => setClosureDate(e.target.value)}
          />
        </label>

        <label className="mb-3 block text-sm text-slate-700">
          סטטוס
          <SelectField
            className="mt-1 block w-full"
            label="בחירת סטטוס"
            clearLabel="-"
            value={closureReason}
            onChange={setClosureReason}
            options={CLOSURE_OPTIONS}
          />
        </label>

        <label className="mb-3 block text-sm text-slate-700">
          ע״י (למי מגיע קרדיט)
          <input className="input mt-1 block w-full" value={closedBy} onChange={(e) => setClosedBy(e.target.value)} />
        </label>

        <label className="mb-4 block text-sm text-slate-700">
          הערה
          <textarea
            className="input mt-1 block w-full"
            rows={2}
            value={closingComment}
            onChange={(e) => setClosingComment(e.target.value)}
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm({ closureDate, closureReason, closedBy, closingComment })}
            className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white"
          >
            שמירה
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
