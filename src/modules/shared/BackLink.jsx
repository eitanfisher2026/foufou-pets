import { Link } from 'react-router-dom';

const CLASS_NAME =
  'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm active:bg-slate-100';

/**
 * The "back to X" link/button shown at the top of every screen except the
 * dashboard itself - used consistently everywhere instead of each screen
 * styling its own, so it always looks the same and always sits on the left
 * (a plain underlined text link at the natural RTL start/right was easy to
 * miss). Pass `to` for a plain route link, or `onClick` for screens that
 * need to confirm first (e.g. unsaved edits) instead of navigating directly.
 *
 * `onBack`, if given, adds a second "חזרה" button that returns to wherever
 * the user actually came from (previous history entry) - useful on hub
 * pages reached from several different places (a list, a match card, the
 * archive), where jumping straight to the dashboard loses that context.
 */
export default function BackLink({ to, onClick, onBack, children }) {
  return (
    <div className="mb-4 flex justify-end gap-2">
      {onBack && (
        <button type="button" onClick={onBack} className={CLASS_NAME}>
          <span aria-hidden="true">←</span> חזרה
        </button>
      )}
      {to ? (
        <Link to={to} className={CLASS_NAME}>
          <span aria-hidden="true">←</span> {children}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={CLASS_NAME}>
          <span aria-hidden="true">←</span> {children}
        </button>
      )}
    </div>
  );
}
