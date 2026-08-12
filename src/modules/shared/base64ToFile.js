/**
 * Turns a base64-encoded image (as returned by the Facebook link-preview
 * fetch) into a real File object, so it can flow through the exact same
 * screenshot pipeline as a picked or pasted file - no separate code path
 * needed downstream for "photo that came from a link" vs. "photo picked by
 * hand".
 */
export function base64ToFile(base64, mimeType, filename) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], filename, { type: mimeType });
}
