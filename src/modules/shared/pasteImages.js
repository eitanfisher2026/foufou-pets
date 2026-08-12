/**
 * Pulls image files out of a paste event's clipboard data - lets someone
 * paste a screenshot (Ctrl+V, e.g. copied straight from Facebook or a
 * screenshot tool) into the same box where they paste the post's link/text,
 * instead of always having to save it to disk first and browse for it.
 * Returns [] for a plain text paste, which the caller should let through
 * normally (this only prevents default when it actually found an image).
 */
export function getPastedImageFiles(e) {
  const items = Array.from(e.clipboardData?.items || []);
  return items
    .filter((item) => item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}
