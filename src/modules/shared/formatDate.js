const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * DD/Mon/YYYY from separate year/month/day parts - the one place that owns
 * this format, shared by formatDate (plain YYYY-MM-DD strings) and
 * formatDateTime (Firestore Timestamps) so every date in the app reads the
 * same way. Unambiguous regardless of locale (unlike DD/MM vs MM/DD),
 * which is the point.
 *
 * Wherever this is rendered inside the app's RTL layout, wrap it in
 * dir="ltr" (see RecordDetailsDialog's per-row `dir`) - otherwise the
 * browser's bidi algorithm can visually reorder the slash-separated parts
 * (e.g. showing as "Jul/26/2025" instead of "26/Jul/2025") even though the
 * string itself is correct.
 */
export function formatDateParts(year, month, day) {
  const monthAbbr = MONTH_ABBR[Number(month) - 1] || month;
  return `${String(day).padStart(2, '0')}/${monthAbbr}/${year}`;
}

/**
 * Formats a YYYY-MM-DD value (e.g. from an <input type="date">) for
 * display - this only applies to read-only displays (detail dialogs,
 * etc.), not the editable inputs, whose own on-screen format is
 * browser/locale-controlled and can't be overridden.
 */
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return formatDateParts(year, month, day);
}
