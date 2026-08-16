import { useState } from 'react';
import { buildNotifyMessage, buildWhatsAppUrl } from './notifyMessage.js';

/**
 * Lets whoever's looking at a match (the owner themselves, or a volunteer/
 * admin helping out) alert the lost case's owner about a possible match by
 * WhatsApp - the message is always pre-filled but editable, never sent
 * without a look first. "onSent" marks the match as contacted (see
 * REPORT_STATUS.CONTACTED) - the dialog itself stays open afterward, since
 * opening WhatsApp happens in a separate tab/app and someone may still want
 * to copy the text or re-send.
 */
export default function NotifyOwnerDialog({ lostCase, report, onClose, onSent }) {
  const [phone, setPhone] = useState(lostCase?.contactPhone || '');
  const [message, setMessage] = useState(() => buildNotifyMessage(lostCase, report));
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  function handleSend() {
    window.open(buildWhatsAppUrl(phone, message), '_blank', 'noopener,noreferrer');
    if (!sent) {
      setSent(true);
      onSent?.();
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
          <h2 className="text-base font-bold text-slate-800">📱 עדכון הבעלים בוואטסאפ</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-xl leading-none text-slate-400">
            ✕
          </button>
        </div>

        <div className="space-y-3 p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">מספר טלפון</span>
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
            <p className="text-xs text-amber-600">אין מספר טלפון לבעלים - וואטסאפ ייפתח בלי איש קשר, תצטרכו לבחור אחד ידנית.</p>
          )}
          {sent && <p className="text-xs text-emerald-600">הסטטוס של ההתאמה עודכן ל"נוצר קשר".</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSend}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
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
    </div>
  );
}
