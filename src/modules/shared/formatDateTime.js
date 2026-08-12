/**
 * Formats a Firestore Timestamp (createdAt/updatedAt/lastLoginAt, all
 * written via serverTimestamp()) as a readable date+time - separate from
 * formatDate.js, which only handles plain YYYY-MM-DD strings from a date
 * input, not Timestamp objects.
 */
export function formatDateTime(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}
