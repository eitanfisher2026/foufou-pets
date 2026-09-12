import { useState } from 'react';

/**
 * A collapsed-by-default (or open, via defaultOpen) settings section - a
 * header row (icon + title + optional subtitle) that expands to reveal its
 * children. Used to keep the admin settings pages scannable now that they
 * hold several dense sections at once, instead of one long always-open page.
 */
export default function CollapsibleSection({ icon, title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 transition ${
          open ? 'border-slate-300 bg-white' : 'border-transparent bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-3 text-right">
          {icon && <span className="w-7 shrink-0 text-center text-lg">{icon}</span>}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">{title}</div>
            {subtitle && <div className="truncate text-xs text-slate-400">{subtitle}</div>}
          </div>
        </div>
        <span className="shrink-0 text-xs text-slate-400">{open ? '▲ הסתר' : '▼ הצג'}</span>
      </button>
      {open && <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-4">{children}</div>}
    </div>
  );
}
