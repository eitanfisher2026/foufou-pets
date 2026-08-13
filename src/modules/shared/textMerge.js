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
  // The AI's two source fields can overlap the other way too - e.g. a
  // short markings note that's fully contained in a longer colorDescription
  // - in which case the longer one is already the better result, and
  // appending would just repeat the short note inside it.
  if (text.includes(base)) return text;
  return base ? `${base}\n${text}` : text;
}

/** Appends `addition` onto a single-line field like neighborhood, comma-separated. */
export function appendDetail(existing, addition) {
  const text = (addition || '').trim();
  if (!text) return existing || '';
  const base = (existing || '').trim();
  if (base.includes(text)) return existing || '';
  // Same overlap-the-other-way case as appendLine, and a real one in
  // practice: the AI's `neighborhood` sometimes comes back as just the
  // street name while `location` repeats that same street name as the
  // start of a fuller description - appending would double the street.
  if (text.includes(base)) return text;
  return base ? `${base}, ${text}` : text;
}
