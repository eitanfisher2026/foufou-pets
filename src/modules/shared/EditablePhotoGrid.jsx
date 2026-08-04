import { useEffect, useState } from 'react';
import PhotoLightbox from './PhotoLightbox.jsx';

/**
 * Shows already-uploaded photos and newly-picked-but-unsaved photos side by
 * side, each removable and clickable to view full-size, plus an "add
 * photos" control. Used in edit mode for both lost cases and found reports.
 * Removing an existing photo happens immediately (onRemoveExisting deletes
 * it from storage right away); removing a newly-picked photo just drops it
 * from the pending selection, since it hasn't been uploaded yet.
 */
export default function EditablePhotoGrid({ existingPhotos, onRemoveExisting, newPhotos, onNewPhotosChange }) {
  const [previews, setPreviews] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    const urls = newPhotos.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [newPhotos]);

  function handleFileInput(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onNewPhotosChange([...newPhotos, ...files]);
    e.target.value = '';
  }

  function removeNewPhoto(index) {
    onNewPhotosChange(newPhotos.filter((_, i) => i !== index));
  }

  function handleRemoveExisting(photo) {
    if (window.confirm('להסיר את התמונה?')) onRemoveExisting(photo);
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">תמונות</label>
      {(existingPhotos.length > 0 || newPhotos.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-3">
          {existingPhotos.map((p) => (
            <div key={p.path} className="relative">
              <button type="button" onClick={() => setLightboxUrl(p.url)}>
                <img src={p.url} alt="" className="h-28 w-28 rounded-lg border border-slate-200 object-cover" />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveExisting(p)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow"
                aria-label="הסרת תמונה"
              >
                ✕
              </button>
            </div>
          ))}
          {newPhotos.map((file, i) => (
            <div key={i} className="relative">
              <button type="button" onClick={() => setLightboxUrl(previews[i])}>
                <img src={previews[i]} alt="" className="h-28 w-28 rounded-lg border border-emerald-300 object-cover" />
              </button>
              <button
                type="button"
                onClick={() => removeNewPhoto(i)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow"
                aria-label="הסרת תמונה"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <input type="file" accept="image/*" multiple onChange={handleFileInput} />
      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
