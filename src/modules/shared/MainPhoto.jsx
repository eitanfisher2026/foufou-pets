import { useState } from 'react';

/**
 * The big hero photo on a record's detail page. photo.url is deliberately
 * a real, ~1280px-max compressed size (see imageCompression.js) rather than
 * the tiny list thumbnail - both the AI extraction and the AI photo
 * comparison read this same file, and a smaller one would cost them
 * accuracy - so on a slow connection it can take a couple of real seconds
 * to arrive, and used to just leave an empty frame for that whole time.
 * Shows the already-generated, near-instant thumbnail (see uploadPhotos.js)
 * as an immediate placeholder, swapping to the full photo the moment it
 * finishes loading - never a blank frame, and something recognizable is on
 * screen right away instead of a wait that reads as broken. Falls back to
 * a plain pulsing placeholder for a photo with no thumbnail (an older
 * upload, or a secondary photo that was never thumbnailed).
 */
export default function MainPhoto({ photo, onView }) {
  const [loaded, setLoaded] = useState(false);
  if (!photo) return null;

  return (
    <button type="button" onClick={() => onView(photo.url)} className="relative mb-4 block h-64 w-full sm:h-80">
      {!loaded &&
        (photo.thumbUrl ? (
          <img
            src={photo.thumbUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-105 rounded-lg bg-slate-50 object-contain blur-sm ring-4 ring-amber-400"
          />
        ) : (
          <div className="absolute inset-0 animate-pulse rounded-lg bg-slate-200 ring-4 ring-amber-400" />
        ))}
      <img
        src={photo.url}
        alt=""
        onLoad={() => setLoaded(true)}
        className={`relative h-full w-full rounded-lg bg-slate-50 object-contain ring-4 ring-amber-400 transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </button>
  );
}
