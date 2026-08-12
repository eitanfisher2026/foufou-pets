import { useState } from 'react';

/**
 * A small round "i" button that opens a popup with the longer explanation -
 * keeps an input area visually clean by default (one short label instead of
 * several paragraphs of instructions), with the full explanation a single
 * tap away for whoever actually wants it.
 */
export default function InfoButton({ title, children }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="מידע נוסף"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold leading-none text-white"
      >
        i
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-slate-800">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 text-xl leading-none text-slate-400 hover:text-slate-600"
                aria-label="סגירה"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-sm text-slate-600">{children}</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
            >
              הבנתי
            </button>
          </div>
        </div>
      )}
    </>
  );
}
