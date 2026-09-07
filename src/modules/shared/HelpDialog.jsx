import { useState } from 'react';
import HelpCard from './HelpCard.jsx';
import { GETTING_STARTED_CARDS, ADDITIONAL_CARDS } from './helpContent.js';

/**
 * "How does this work" explainer, reached via the ℹ️ button next to the
 * dashboard header - two tabs (a sequential getting-started walkthrough,
 * and a reference list of features that don't have a natural order), same
 * shape as SuperZola's own help screen. Used to be one long admin-editable
 * paragraph; this content is hardcoded now (see helpContent.js) since a
 * structured walkthrough like this is worth reviewing like any other code
 * change, not something that holds up as a wall of text in a textarea.
 */
export default function HelpDialog({ onClose }) {
  const [tab, setTab] = useState('start');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-gradient-to-l from-blue-500 to-indigo-500 px-4 py-3 text-white">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <span>ℹ️</span> איך זה עובד?
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-xl leading-none text-white/90">
            ✕
          </button>
        </div>

        <div className="flex justify-center border-b border-slate-100 px-4 pt-3">
          <div className="flex gap-1 rounded-full bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('start')}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                tab === 'start' ? 'bg-slate-800 text-white' : 'text-slate-500'
              }`}
            >
              התחלת עבודה
            </button>
            <button
              type="button"
              onClick={() => setTab('more')}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                tab === 'more' ? 'bg-slate-800 text-white' : 'text-slate-500'
              }`}
            >
              יכולות נוספות
            </button>
          </div>
        </div>

        <div className="space-y-2 overflow-y-auto p-4">
          {(tab === 'start' ? GETTING_STARTED_CARDS : ADDITIONAL_CARDS).map((card) => (
            <HelpCard key={card.title} {...card} />
          ))}
        </div>

        <div className="border-t border-slate-100 px-4 py-3 text-center">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-6 py-2 text-sm font-medium text-white">
            סגירה
          </button>
        </div>
      </div>
    </div>
  );
}
