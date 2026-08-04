/**
 * In-app confirmation modal, styled like the rest of the app, instead of
 * the browser's native confirm() popup. Rendered by useConfirm().
 */
export default function ConfirmDialog({ message, confirmLabel = 'אישור', cancelLabel = 'ביטול', danger = true, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="mb-4 text-sm text-slate-700">{message}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium text-white ${danger ? 'bg-red-600' : 'bg-slate-800'}`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
