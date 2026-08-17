const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

// Small enough to cover a 64px CSS thumbnail even at 3x pixel density
// (64*3=192) with headroom, while staying tiny in bytes - this is what the
// list/search rows load instead of the full-size photo, so it's what
// actually needs to be cheap and fast.
const THUMB_MAX_DIMENSION = 220;
const THUMB_JPEG_QUALITY = 0.7;

/**
 * Resizes and re-encodes an image client-side. `source` can be a File
 * (fresh upload) or a Blob (e.g. an already-compressed image, when
 * generating a thumbnail from it instead of re-decoding the original).
 */
function resize(source, { maxDimension, quality }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(source);

    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('compression failed'))),
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not read image'));
    };

    img.src = url;
  });
}

/**
 * Resizes and re-encodes an image file before upload. Keeps storage and
 * bandwidth cost down; full resolution isn't needed for matching or AI
 * attribute extraction.
 */
export function compressImage(file) {
  return resize(file, { maxDimension: MAX_DIMENSION, quality: JPEG_QUALITY });
}

/**
 * Produces a small list-thumbnail version of an image (source can be the
 * original file or an already-compressed blob - resizing from the latter is
 * cheaper since it's already downscaled).
 */
export function compressThumbnail(source) {
  return resize(source, { maxDimension: THUMB_MAX_DIMENSION, quality: THUMB_JPEG_QUALITY });
}
