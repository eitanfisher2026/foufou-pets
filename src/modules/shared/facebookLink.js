const FACEBOOK_URL_RE = /https?:\/\/(?:www\.|m\.|l\.)?(?:facebook\.com|fb\.watch|fb\.me)\/\S+/i;

/**
 * Finds a Facebook URL inside pasted/typed text, if there is one - used to
 * decide when to offer "pull the photo/text from this link" instead of
 * treating the whole box as opaque free text. Trailing punctuation that's
 * clearly not part of the URL (a period or closing bracket picked up from
 * surrounding sentence text) is trimmed off.
 */
export function extractFacebookUrl(text) {
  const match = text?.match(FACEBOOK_URL_RE);
  return match ? match[0].replace(/[)\].,]+$/, '') : null;
}
