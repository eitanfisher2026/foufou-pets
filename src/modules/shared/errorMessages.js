// Turns a thrown Firestore/Storage error into a plain Hebrew sentence for
// whoever hit it. Permission errors get their own message (the concrete,
// actionable reason - "you're not allowed to do this") rather than the
// generic fallback, since the two most common causes of an action silently
// doing nothing are "you're not allowed" and "something broke" and those
// deserve different words.
const PERMISSION_ERROR_CODES = new Set(['permission-denied', 'storage/unauthorized']);

export function getErrorMessage(err) {
  if (PERMISSION_ERROR_CODES.has(err?.code)) {
    return 'אין לך הרשאה לבצע שינוי ברשומה הזו.';
  }
  return `הפעולה נכשלה${err?.code || err?.message ? ` (${err.code || err.message})` : ''}. נסו שוב.`;
}
