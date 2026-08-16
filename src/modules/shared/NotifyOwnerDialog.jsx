import { useState } from 'react';
import { buildNotifyMessage, buildNotifyFinderMessage, buildWhatsAppUrl } from './notifyMessage.js';
import { updateLostCaseClosure } from '../lost-report/lostReportApi.js';
import { updateFoundReportStatus } from '../found-report/foundReportApi.js';
import { RECORD_STATUS, CLOSURE_REASON } from './collections.js';
import { useConfirm } from './useConfirm.jsx';

/**
 * Lets whoever's looking at a match (the owner themselves, or a volunteer/
 * admin helping out) alert the other side about a possible match by
 * WhatsApp - the message is always pre-filled but editable, never sent
 * without a look first. "onSent" marks the match as contacted (see
 * REPORT_STATUS.CONTACTED) - the dialog itself stays open afterward, since
 * opening WhatsApp happens in a separate tab/app and someone may still want
 * to copy the text or re-send.
 *
 * `direction` picks who this message is for and about, since the same
 * match can be reviewed from either side (see LostCaseDetail.jsx and
 * FoundReportDetail.jsx):
 *   - 'toOwner' (default): recipient is the lost case's contact, message
 *     describes the found/seen sighting - used when reviewing matches from
 *     the lost-case side.
 *   - 'toFinder': recipient is the found report's contact (whoever spotted/
 *     found the animal), message describes the LOST pet and its owner's
 *     contact info instead - used when reviewing matches from the
 *     found-report side, where the found report's reporter is often a
 *     stranger who doesn't yet know which lost pet this might be.
 *
 * The "confirmed match" checkbox is a separate, optional step - closing
 * both records out (lost case -> resolved/returned-to-owner, found report
 * -> resolved) is a bigger, less reversible action than just sending a
 * message, so it only fires when explicitly checked, never as a side
 * effect of just opening WhatsApp or copying the text. This applies the
 * same way regardless of direction - confirming the match closes both
 * records either way.
 */
export default function NotifyOwnerDialog({ lostCase, report, foundReportId, direction = 'toOwner', onClose, onSent, onResolved }) {
  const toFinder = direction === 'toFinder';
  const [phone, setPhone] = useState((toFinder ? report?.contactPhone : lostCase?.contactPhone) || '');
  const [message, setMessage] = useState(() =>
    toFinder ? buildNotifyFinderMessage(report, lostCase) : buildNotifyMessage(lostCase, report)
  );
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [markResolved, setMarkResolved] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function handleSend() {
    if (!phone.trim()) {
      const who = toFinder ? 'למי שמצא/ה' : 'לבעלים';
      const ok = await confirm(`אין מספר טלפון ${who} - וואטסאפ ייפתח בלי איש קשר, ותצטרכו לבחור אחד ידנית. להמשיך?`, {
        confirmLabel: 'המשך',
        cancelLabel: 'ביטול',
        danger: false,
      });
      if (!ok) return;
    }
    window.open(buildWhatsAppUrl(phone, message), '_blank', 'noopener,noreferrer');
    if (!sent) {
      setSent(true);
      onSent?.();
    }
    if (markResolved && !resolved) {
      setResolving(true);
      try {
        await Promise.all([
          updateLostCaseClosure(lostCase.id, RECORD_STATUS.RESOLVED, {
            closureDate: new Date().toISOString().slice(0, 10),
            closureReason: CLOSURE_REASON.RETURNED_TO_OWNER,
            closedBy: '',
            closingComment: 'סומן כהתאמה שנמצאה דרך התראת וואטסאפ',
          }),
          updateFoundReportStatus(foundReportId, RECORD_STATUS.RESOLVED),
        ]);
        setResolved(true);
        onResolved?.();
      } finally {
        setResolving(false);
      }
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) - the
      // text is still right there in the textarea to select by hand.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-bold text-slate-800">
            {toFinder ? '📱 יצירת קשר עם מי שמצא/ה בוואטסאפ' : '📱 עדכון הבעלים בוואטסאפ'}
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-xl leading-none text-slate-400">
            ✕
          </button>
        </div>

        <div className="space-y-3 p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">מספר טלפון {toFinder ? 'של מי שמצא/ה' : 'של הבעלים'}</span>
            <input
              className="input w-full"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05X-XXXXXXX"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">ההודעה (אפשר לערוך)</span>
            <textarea className="input w-full" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>

          {!phone.trim() && (
            <p className="text-xs text-amber-600">
              אין מספר טלפון {toFinder ? 'למי שמצא/ה' : 'לבעלים'} - וואטסאפ ייפתח בלי איש קשר, תצטרכו לבחור אחד ידנית.
            </p>
          )}

          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={markResolved}
              onChange={(e) => setMarkResolved(e.target.checked)}
            />
            <span>
              <span className="font-medium">סימון ההתאמה כמאושרת</span>
              <br />
              <span className="text-xs text-slate-500">
                יסגור גם את תיק החיפוש (נמצא/הוחזר לבעלים) וגם את הדיווח שנמצא - רק כשלוחצים "פתיחה בוואטסאפ" למטה.
              </span>
            </span>
          </label>

          {sent && <p className="text-xs text-emerald-600">הסטטוס של ההתאמה עודכן ל"נוצר קשר".</p>}
          {resolving && <p className="text-xs text-slate-500">סוגר את שתי הרשומות...</p>}
          {resolved && <p className="text-xs text-emerald-600">שני הרשומות סומנו כהתאמה שנמצאה וסגורות.</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={resolving}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              📱 פתיחה בוואטסאפ
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
            >
              {copied ? 'הועתק ✓' : 'העתקה'}
            </button>
          </div>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
