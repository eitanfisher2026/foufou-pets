import HelpCard from './HelpCard.jsx';
import { getGettingStartedCards } from './helpContent.js';
import { usePwaInstall } from './usePwaInstall.js';

/**
 * "How does this work" explainer, reached via the ℹ️ button next to the
 * dashboard header - one single walkthrough list, same shape as SuperZola's
 * own help screen. Used to be one long admin-editable paragraph; this
 * content is hardcoded now (see helpContent.js) since a structured
 * walkthrough like this is worth reviewing like any other code change, not
 * something that holds up as a wall of text in a textarea. Used to be two
 * tabs (this walkthrough plus a separate "additional capabilities" list) -
 * merged into one list once the archive card was removed and left too
 * little content to justify a second tab, some of it already repeating
 * what the walkthrough said.
 */
export default function HelpDialog({ onClose }) {
  const { isIOS, isAndroid } = usePwaInstall();
  const cards = getGettingStartedCards({ isIOS, isAndroid });

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

        <div className="space-y-2 overflow-y-auto p-4">
          {cards.map((card) => (
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
