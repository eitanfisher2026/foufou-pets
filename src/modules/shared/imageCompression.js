const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

/**
 * Resizes and re-encodes an image file client-side before upload.
 * Keeps storage and bandwidth cost down; full resolution isn't needed
 * for matching or AI attribute extraction.
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('compression failed'))),
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not read image'));
    };

    img.src = url;
  });
}
