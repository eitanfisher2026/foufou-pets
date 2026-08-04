import { useEffect, useState } from 'react';

/**
 * Shows already-uploaded photos and newly-picked-but-unsaved photos side by
 * side, each removable, plus an "add photos" control. Used in edit mode for
 * both lost cases and found reports.
 */
export default function EditablePhotoGrid({ existingPhotos, onRemoveExisting, newPhotos, onNewPhotosChange }) {
  const [previews, setPreviews] = useState([]);

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

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">תמונות</label>
      {(existingPhotos.length > 0 || newPhotos.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-3">
          {existingPhotos.map((p) => (
            <div key={p.path} className="relative">
              <img src={p.url} alt="" className="h-28 w-28 rounded-lg border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => onRemoveExisting(p)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow"
                aria-label="הסרת תמונה"
              >
                ✕
              </button>
            </div>
          ))}
          {newPhotos.map((file, i) => (
            <div key={i} className="relative">
              <img src={previews[i]} alt="" className="h-28 w-28 rounded-lg border border-emerald-300 object-cover" />
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
    </div>
  );
}
