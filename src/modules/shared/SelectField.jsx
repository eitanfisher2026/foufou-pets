import { useState } from 'react';

// Accepts either plain strings (colors, breeds - display text doubles as the
// value) or { value, label, description? } objects (size/age/fur-type/
// condition/closure-reason, where the stored value and the shown label
// differ, or a term like "פוינט" needs a plain-language explanation under
// it) - callers just pass whatever list they already have, no per-call-site
// mapping needed.
function normalizeOption(opt) {
  return typeof opt === 'string' ? { value: opt, label: opt } : opt;
}

/**
 * Drop-in replacement for a native <select>, styled to match the .input
 * fields around it but opening our own full-screen picker instead of the
 * OS's native dropdown - the native one has no close/X affordance we can
 * add to it (that chrome is drawn entirely by the OS, outside anything a
 * web page can touch), and on Android also enforces its own oversized
 * touch targets no matter what CSS is applied (same reasoning as
 * DropdownBadge.jsx, just for a full option list instead of a small badge
 * menu). Tapping an option selects and closes immediately, matching how a
 * native picker behaves - there's no separate "confirm" step.
 */
export default function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'בחר/י',
  allowClear = true,
  clearLabel = 'ללא בחירה',
  disabled = false,
  className = '',
  // Opt-in, not the default: several callers (size small→large, condition,
  // record-type lost/found/both, comparison method...) have a real logical
  // order that alphabetizing would break. Only the pet-detail and search
  // dialogs' open-ended, admin-editable lists (color/breed/pattern/collar
  // color) pass this - sorted with the Hebrew locale collator so it
  // actually reads right (not code-point order, which would misplace
  // niqqud/final letters).
  sortAlpha = false,
}) {
  const [open, setOpen] = useState(false);
  const normalized = options.map(normalizeOption);
  if (sortAlpha) {
    // "אחר" (other) is a catch-all, not really "a value alphabetized among
    // the rest" - every options list that includes it already treats it as
    // a fixed, always-last entry (see colorOptionsApi.js etc.), so sorting
    // keeps that convention instead of letting it land wherever א happens
    // to fall alphabetically (first, misleadingly, most of the time).
    const other = normalized.filter((o) => o.value === 'אחר');
    const rest = normalized.filter((o) => o.value !== 'אחר').sort((a, b) => a.label.localeCompare(b.label, 'he'));
    normalized.splice(0, normalized.length, ...rest, ...other);
  }
  const selected = normalized.find((o) => o.value === value);

  function choose(v) {
    onChange(v);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`input flex min-w-0 items-center justify-between gap-2 text-start disabled:opacity-50 ${className}`}
      >
        <span className={`truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[10px] text-slate-400">
          ▾
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between gap-3 px-3 py-2">
              <h2 className="text-base font-bold text-slate-800">{label || placeholder}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 text-xl leading-none text-slate-400 hover:text-slate-600"
                aria-label="סגירה"
              >
                ✕
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {allowClear && (
                <button
                  type="button"
                  onClick={() => choose('')}
                  className="flex w-full items-center gap-3 px-3 py-3 text-start"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      !value ? 'border-blue-600' : 'border-slate-300'
                    }`}
                  >
                    {!value && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                  </span>
                  <span className="text-slate-500">{clearLabel}</span>
                </button>
              )}
              {normalized.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => choose(o.value)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-start"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      value === o.value ? 'border-blue-600' : 'border-slate-300'
                    }`}
                  >
                    {value === o.value && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                  </span>
                  <span className="flex flex-col items-start">
                    <span className="text-slate-800">{o.label}</span>
                    {o.description && <span className="text-xs text-slate-400">{o.description}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
