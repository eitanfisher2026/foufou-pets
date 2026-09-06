import { useEffect, useRef, useState } from 'react';

/**
 * A small colored pill that opens a menu of options - used everywhere a
 * status-like field needs to look like a compact badge (current value
 * always visible) while still being changeable inline. Built from a
 * button + our own menu rather than a native <select>: Android was
 * enforcing its own larger native touch-target size on styled selects no
 * matter what CSS was applied, making them render oversized regardless of
 * padding/height. A fully custom dropdown has no native form-control
 * chrome to fight, so its size is exactly what this CSS says.
 *
 * `order` is an optional array of keys controlling the menu's option
 * order - falls back to `labels`' own object key order when omitted,
 * which for a plain object literal is exactly its declared order (fine
 * for a genuinely arbitrary set of options, fragile for one where the
 * order itself is meaningful - see ORDERED_MATCH_STATUSES in
 * matchStatusLabels.js for a real one).
 */
export default function DropdownBadge({ value, labels, order, onChange, colorClass = 'bg-slate-100 text-slate-600' }) {
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
        className={`inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-black/10 px-4 text-xs font-semibold leading-none shadow-sm ${colorClass}`}
      >
        {labels[value] || value}
        <span aria-hidden="true" className="text-[9px]">
          ▾
        </span>
      </button>
      {open && (
        <div
          className="absolute z-20 mt-1 min-w-max overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{ insetInlineEnd: 0 }}
        >
          {(order || Object.keys(labels)).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
              className={`block w-full whitespace-nowrap px-3 py-1.5 text-right text-xs ${
                v === value ? 'font-semibold text-slate-800' : 'text-slate-600'
              }`}
            >
              {labels[v]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
