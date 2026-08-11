import { useEffect, useRef, useState } from 'react';

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
 *
 * Built from a button + our own menu rather than a native <select> - Android
 * was enforcing its own larger native touch-target size on the select
 * regardless of the small CSS padding here, making the pill render oversized
 * no matter how it was styled. A fully custom dropdown has no native chrome
 * to fight, so its size is exactly what this CSS says.
 */
export default function RecordStatusSelect({ status, labels, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-6 max-w-full items-center gap-1 whitespace-nowrap rounded-full border border-black/10 px-3 text-xs font-semibold leading-none shadow-sm ${
          STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'
        }`}
      >
        {labels[status] || status}
        <span aria-hidden="true" className="text-[9px]">
          ▾
        </span>
      </button>
      {open && (
        <div
          className="absolute z-20 mt-1 min-w-max overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{ insetInlineEnd: 0 }}
        >
          {Object.entries(labels).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                onChange(value);
                setOpen(false);
              }}
              className={`block w-full whitespace-nowrap px-3 py-1.5 text-right text-xs ${
                value === status ? 'font-semibold text-slate-800' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
