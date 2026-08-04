const MIN_FRACTION = 0.05;

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

/**
 * Crops a normalized (0-1) fractional region out of an image file and
 * returns a JPEG Blob, or null if the region is missing or too small to be
 * useful.
 */
function cropRegion(file, region) {
  const x = clamp01(region.x);
  const y = clamp01(region.y);
  const width = Math.min(clamp01(region.width), 1 - x);
  const height = Math.min(clamp01(region.height), 1 - y);
  if (width < MIN_FRACTION || height < MIN_FRACTION) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const sx = Math.round(x * img.width);
      const sy = Math.round(y * img.height);
      const sw = Math.round(width * img.width);
      const sh = Math.round(height * img.height);
      URL.revokeObjectURL(url);

      if (sw <= 0 || sh <= 0) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not read image'));
    };

    img.src = url;
  });
}

/**
 * Pulls the animal's own photo out of one of the originally-selected
 * screenshot files, using the bounding box the AI extraction located, so
 * the record's main photo is a clean shot of the animal rather than the
 * whole social-media post. Returns null if extraction found no clear photo
 * or the region was unusable.
 */
export async function extractMainPhoto(files, mainPhotoRegion) {
  if (!mainPhotoRegion?.found) return null;
  const file = files[mainPhotoRegion.imageIndex];
  if (!file) return null;
  try {
    return await cropRegion(file, mainPhotoRegion);
  } catch {
    return null;
  }
}
