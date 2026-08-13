import { formatDateParts } from './formatDate.js';

/**
 * Formats a Firestore Timestamp (createdAt/updatedAt/lastLoginAt, all
 * written via serverTimestamp()) as a readable date+time - the date part
 * uses the same DD/Mon/YYYY format as formatDate.js (which only handles
 * plain YYYY-MM-DD strings, not Timestamp objects) so every date in the
 * app reads the same way. Same bidi note as formatDate.js applies - wrap
 * the result in dir="ltr" wherever it's rendered inside the RTL layout.
 */
export function formatDateTime(ts) {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  const datePart = formatDateParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const timePart = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}
