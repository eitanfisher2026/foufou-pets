import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { compressImage } from '../shared/imageCompression.js';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Sends 1+ screenshot files to the shared extraction function and returns
 * the structured fields Claude was able to read from them. Used by both
 * the lost-report and found-report modules - built once, called by both.
 * Images are compressed the same way as before a storage upload: full-size
 * WhatsApp/Facebook screenshots can be several MB, which slows the request
 * and costs more in image tokens without improving OCR accuracy.
 */
export async function readScreenshots(files) {
  const images = await Promise.all(
    files.map(async (file) => ({
      base64: await blobToBase64(await compressImage(file)),
      mimeType: 'image/jpeg',
    }))
  );

  // Matches the function's own 120s timeout - the SDK's 70s default would
  // otherwise abort client-side before a slower extraction finishes server-side.
  const extract = httpsCallable(functions, 'extractReportFromImages', { timeout: 120000 });
  const result = await extract({ images });
  return result.data;
}
