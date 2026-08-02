import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Sends 1+ screenshot files to the shared extraction function and returns
 * the structured fields Claude was able to read from them. Used by both
 * the lost-report and found-report modules - built once, called by both.
 */
export async function readScreenshots(files) {
  const images = await Promise.all(
    files.map(async (file) => ({
      base64: await fileToBase64(file),
      mimeType: file.type || 'image/jpeg',
    }))
  );

  const extract = httpsCallable(functions, 'extractReportFromImages');
  const result = await extract({ images });
  return result.data;
}
