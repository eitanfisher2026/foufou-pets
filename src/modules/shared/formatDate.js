const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a YYYY-MM-DD value (e.g. from an <input type="date">) as
 * DD/Mon/YY for display - the native date input's own on-screen format is
 * browser/locale-controlled and can't be overridden, so this only applies
 * to read-only displays (detail dialogs, etc.), not the editable inputs.
 */
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  const monthAbbr = MONTH_ABBR[Number(month) - 1] || month;
  return `${day}/${monthAbbr}/${year.slice(-2)}`;
}
