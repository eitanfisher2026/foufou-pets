/**
 * Shared by the lost/found field mappers and the one-time legacy-field
 * migration: colorDescription, hasFluffyTail, and lastSeenLocation/location
 * were retired as their own fields and now fold into markings/neighborhood
 * instead. Both helpers skip re-appending text that's already present, so
 * merging the same extraction result twice (or migrating a record twice)
 * doesn't pile up duplicate lines.
 */

/** Appends `addition` as its own line onto a multi-line field like markings. */
export function appendLine(existing, addition) {
  const text = (addition || '').trim();
  if (!text) return existing || '';
  const base = (existing || '').trim();
  if (base.includes(text)) return existing || '';
  return base ? `${base}\n${text}` : text;
}

/** Appends `addition` onto a single-line field like neighborhood, comma-separated. */
export function appendDetail(existing, addition) {
  const text = (addition || '').trim();
  if (!text) return existing || '';
  const base = (existing || '').trim();
  if (base.includes(text)) return existing || '';
  return base ? `${base}, ${text}` : text;
}
