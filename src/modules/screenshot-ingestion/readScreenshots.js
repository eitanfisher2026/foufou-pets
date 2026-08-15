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
 *
 * `species` ('cat'/'dog') picks which of the two static extraction schemas
 * the server uses (color/breed enums differ per species) - every caller
 * already knows species by this point, either from the dashboard's fixed
 * mode (dedicated forms, re-scans) or from a fresh detectSpecies() call
 * (smart-add/share-target, see useSmartIntake.js).
 */
export async function readScreenshots(files, postText = '', species) {
  const images = await Promise.all(
    files.map(async (file) => ({
      base64: await blobToBase64(await compressImage(file)),
      mimeType: 'image/jpeg',
    }))
  );

  // Matches the function's own 120s timeout - the SDK's 70s default would
  // otherwise abort client-side before a slower extraction finishes server-side.
  const extract = httpsCallable(functions, 'extractReportFromImages', { timeout: 120000 });
  const result = await extract({ images, postText, species });
  return result.data;
}

/**
 * Cheap, fast species-only classification of a single photo - used only by
 * the smart-add/share-target flow, which (unlike every other intake path)
 * genuinely doesn't know cat-or-dog before extraction. Deliberately its own
 * tiny call rather than folded into readScreenshots(): the main extraction
 * needs species as an input to pick its schema, so this has to resolve
 * first and separately.
 */
export async function detectSpecies(file) {
  const image = { base64: await blobToBase64(await compressImage(file)), mimeType: 'image/jpeg' };
  const detect = httpsCallable(functions, 'detectPetSpecies', { timeout: 30000 });
  const result = await detect({ image });
  return result.data;
}
