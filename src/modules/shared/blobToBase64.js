// Shared by every path that sends image bytes to a Cloud Function as base64
// (AI screenshot reading, and now the record-photo upload function too) -
// one copy instead of the same FileReader dance re-implemented per caller.
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
