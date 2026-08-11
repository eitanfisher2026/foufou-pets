import { useState } from 'react';
import { CLOSURE_REASON, CLOSURE_REASON_LABELS } from './collections.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Prompts for the closure date/reason/comment right at the moment a case is
 * marked archived or resolved, instead of leaving that to be filled in
 * later via the edit form - a case marked closed without this ends up
 * blank on the archive page, with no way to tell why or when it closed.
 */
export default function ClosureDialog({ onConfirm, onCancel }) {
  const [closureDate, setClosureDate] = useState(todayIso());
  const [closureReason, setClosureReason] = useState('');
  const [closingComment, setClosingComment] = useState('');

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
          <select className="input mt-1 block w-full" value={closureReason} onChange={(e) => setClosureReason(e.target.value)}>
            <option value="">-</option>
            {Object.values(CLOSURE_REASON).map((reason) => (
              <option key={reason} value={reason}>
                {CLOSURE_REASON_LABELS[reason]}
              </option>
            ))}
          </select>
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
            onClick={() => onConfirm({ closureDate, closureReason, closingComment })}
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
