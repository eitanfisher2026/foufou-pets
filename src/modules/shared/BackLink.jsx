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
 */
export default function BackLink({ to, onClick, children }) {
  return (
    <div className="mb-4 flex justify-end">
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
