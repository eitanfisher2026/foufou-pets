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

  lines.push('', 'בהצלחה! 🙏', '', 'נשלח דרך אפליקציית איתור חיות מחמד (FouFou-Pets) 🐾', 'https://foufou-pets.web.app');
  return lines.join('\n');
}

/**
 * The mirror of buildNotifyMessage, for the reverse direction: starting
 * from a found/seen report and telling whoever reported it (the finder,
 * not necessarily the lost pet's owner) about a possible match to a lost
 * case - so the message needs to be about the LOST pet (its name, where/
 * when it went missing, its owner's contact info), not the found sighting
 * the finder already knows about firsthand.
 */
export function buildNotifyFinderMessage(report, lostCase) {
  const animal = petLabels(lostCase?.species || report?.species).animal;
  const lines = [`היי! יש התאמה אפשרית ל${animal} שמצאת/ראית 🐾`, ''];

  let lost = `יתכן שזה ${displayLostCaseName(lostCase)}, ${animal} שאבד`;
  const whereParts = [lostCase?.city, lostCase?.neighborhood].filter(Boolean);
  if (whereParts.length > 0) lost += ` ב${whereParts.join(', ')}`;
  if (lostCase?.lastSeenAt) lost += `, ${lostCase.lastSeenAt}`;
  lines.push(lost + '.');

  if (lostCase?.sourceUrl) {
    lines.push('', `לצפייה בפוסט המקורי: ${lostCase.sourceUrl}`);
  } else if (lostCase?.markings) {
    lines.push('', `סימנים מיוחדים: ${lostCase.markings}`);
  }

  if (lostCase?.contactName || lostCase?.contactPhone) {
    lines.push('', `פרטי קשר של הבעלים: ${[lostCase.contactName, lostCase.contactPhone].filter(Boolean).join(' - ')}`);
  }

  lines.push('', 'תודה על העזרה! 🙏', '', 'נשלח דרך אפליקציית איתור חיות מחמד (FouFou-Pets) 🐾', 'https://foufou-pets.web.app');
  return lines.join('\n');
}

// wa.me needs digits only, international format with no leading "+" or
// "0" - e.g. "054-123-4567" -> "972541234567". Same normalization
// direction as duplicateCheckApi.js's phone matching, just inverted (that
// one strips 972 back to a leading 0 for comparison; this one adds it).
function toWhatsAppNumber(phone) {
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
