import { petLabels } from './petLabels.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';

/**
 * Drafts a Hebrew WhatsApp message telling a lost case's owner about a
 * possible match seen on Facebook - always a starting point to review and
 * edit (see NotifyOwnerDialog.jsx), never sent as-is without a person
 * looking at it first. Prefers the found report's own source link (so the
 * owner can see the real post without needing to sign into this app); when
 * there isn't one, falls back to describing the sighting in the message
 * itself.
 */
export function buildNotifyMessage(lostCase, report) {
  const animal = petLabels(lostCase?.species).animal;
  const name = displayLostCaseName(lostCase);
  const lines = [`היי! יש התאמה אפשרית ל${name} 🐾`, ''];

  const whereParts = [report?.city, report?.neighborhood].filter(Boolean);
  let sighting = `${animal} שנראה/נמצא`;
  if (whereParts.length > 0) sighting += ` ב${whereParts.join(', ')}`;
  if (report?.dateText) sighting += `, ${report.dateText}`;
  lines.push(sighting + '.');

  if (report?.sourceUrl) {
    lines.push('', `לצפייה בפוסט המקורי: ${report.sourceUrl}`);
  } else if (report?.markings) {
    lines.push('', `סימנים מיוחדים: ${report.markings}`);
  }

  if (report?.contactName || report?.contactPhone) {
    lines.push('', `פרטי קשר של מי שמצא/ה: ${[report.contactName, report.contactPhone].filter(Boolean).join(' - ')}`);
  }

  lines.push('', 'בהצלחה! 🙏');
  return lines.join('\n');
}

// wa.me needs digits only, international format with no leading "+" or
// "0" - e.g. "054-123-4567" -> "972541234567". Same normalization
// direction as duplicateCheckApi.js's phone matching, just inverted (that
// one strips 972 back to a leading 0 for comparison; this one adds it).
export function toWhatsAppNumber(phone) {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '972' + digits.slice(1);
  return digits;
}

// No phone still opens WhatsApp with the message pre-filled and lets the
// person pick a contact manually, rather than blocking the feature
// entirely when the lost case has no number on file.
export function buildWhatsAppUrl(phone, message) {
  const number = toWhatsAppNumber(phone);
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}
