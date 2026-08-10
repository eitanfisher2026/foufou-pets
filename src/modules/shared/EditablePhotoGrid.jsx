import { useEffect, useState } from 'react';
import PhotoLightbox from './PhotoLightbox.jsx';
import { useConfirm } from './useConfirm.jsx';

/**
 * Shows already-uploaded photos and newly-picked-but-unsaved photos side by
 * side, each removable and clickable to view full-size, plus an "add
 * photos" control. Used in edit mode for both lost cases and found reports,
 * and reused for the photo preview on the create forms (with
 * existingPhotos always empty there). Removing/promoting an existing photo
 * happens immediately via the parent's callback (persisted right away);
 * removing/promoting a newly-picked photo is purely local state, since it
 * hasn't been uploaded yet. Promoting a new photo to "main" ahead of
 * existing ones is a common real case (e.g. replacing a badly-cropped main
 * photo with a manually-fixed one) - the parent tracks that intent via
 * newPhotosFirst and reorders the saved result to match once the new photo
 * actually has a URL to promote.
 */
export default function EditablePhotoGrid({
  existingPhotos,
  onRemoveExisting,
  onMakeMainExisting,
  newPhotos,
  onNewPhotosChange,
  newPhotosFirst = false,
  onNewPhotosFirstChange,
  label = 'תמונות',
  addLabel = 'הוספת תמונות',
}) {
  const [previews, setPreviews] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const { confirm, dialog } = useConfirm();

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

  function makeNewPhotoMain(index) {
    onNewPhotosChange([newPhotos[index], ...newPhotos.filter((_, i) => i !== index)]);
    onNewPhotosFirstChange?.(true);
  }

  async function handleRemoveExisting(photo) {
    if (await confirm('להסיר את התמונה?')) onRemoveExisting(photo);
  }

  async function handleMakeExistingMain(photo) {
    onNewPhotosFirstChange?.(false);
    await onMakeMainExisting(photo);
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>
      {(existingPhotos.length > 0 || newPhotos.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-3">
          {existingPhotos.map((p, i) => {
            const isMain = !newPhotosFirst && i === 0;
            return (
            <div key={p.path} className="relative">
              <button type="button" onClick={() => setLightboxUrl(p.url)}>
                <img
                  src={p.url}
                  alt=""
                  className={`h-28 w-28 rounded-lg object-cover ${
                    isMain ? 'ring-4 ring-amber-400' : 'border border-slate-200'
                  }`}
                />
              </button>
              {isMain ? (
                <span className="absolute bottom-1 left-1 rounded bg-amber-500 px-1 py-0.5 text-[9px] font-medium text-white">
                  ראשית
                </span>
              ) : (
                onMakeMainExisting && (
                  <button
                    type="button"
                    onClick={() => handleMakeExistingMain(p)}
                    className="absolute bottom-1 left-1 rounded bg-slate-800/80 px-1 py-0.5 text-[9px] font-medium text-white"
                  >
                    הפוך לראשית
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => handleRemoveExisting(p)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow"
                aria-label="הסרת תמונה"
              >
                ✕
              </button>
            </div>
            );
          })}
          {newPhotos.map((file, i) => {
            const isMain = (existingPhotos.length === 0 || newPhotosFirst) && i === 0;
            return (
              <div key={i} className="relative">
                <button type="button" onClick={() => setLightboxUrl(previews[i])}>
                  <img
                    src={previews[i]}
                    alt=""
                    className={`h-28 w-28 rounded-lg object-cover ${
                      isMain ? 'ring-4 ring-amber-400' : 'border border-emerald-300'
                    }`}
                  />
                </button>
                {isMain ? (
                  <span className="absolute bottom-1 left-1 rounded bg-amber-500 px-1 py-0.5 text-[9px] font-medium text-white">
                    ראשית
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeNewPhotoMain(i)}
                    className="absolute bottom-1 left-1 rounded bg-slate-800/80 px-1 py-0.5 text-[9px] font-medium text-white"
                  >
                    הפוך לראשית
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeNewPhoto(i)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow"
                  aria-label="הסרת תמונה"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      <label className="mb-1 block text-xs text-slate-500">{addLabel}</label>
      <input type="file" accept="image/*" multiple onChange={handleFileInput} />
      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {dialog}
    </div>
  );
}
