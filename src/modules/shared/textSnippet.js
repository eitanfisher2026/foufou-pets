const MAX_FALLBACK_NAME_LENGTH = 30;

/**
 * Shortens free text (typically a record's `markings`) down to a
 * title-sized snippet fit to stand in for a missing name - markings can be
 * several lines long (one distinct mark per line), so only the first line
 * is used. Shared between lost cases and found reports so an unnamed
 * animal on either side gets the same kind of readable fallback instead of
 * a generic species word.
 */
export function shortSnippet(text) {
  if (!text) return '';
  const firstLine = text.split('\n')[0].trim();
  return firstLine.length > MAX_FALLBACK_NAME_LENGTH
    ? firstLine.slice(0, MAX_FALLBACK_NAME_LENGTH).trim() + '…'
    : firstLine;
}
