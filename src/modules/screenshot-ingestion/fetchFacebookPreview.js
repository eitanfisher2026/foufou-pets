import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

/**
 * Asks the backend to pull a public Facebook post's own preview text/photo
 * straight from the link (see fetchFacebookLinkPreview in functions/index.js
 * for how - no login, no credentials, just the same public preview data
 * Facebook itself serves to generate a link's rich preview elsewhere).
 * Returns { text, imageBase64, imageMimeType } - any of which can come back
 * empty if the post is private or the fetch otherwise didn't turn up
 * anything, which callers should treat as "no bonus data", not an error.
 */
export async function fetchFacebookPreview(url) {
  const call = httpsCallable(functions, 'fetchFacebookLinkPreview', { timeout: 30000 });
  const result = await call({ url });
  return result.data;
}
