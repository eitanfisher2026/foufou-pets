import { useState } from 'react';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import BackLink from '../shared/BackLink.jsx';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import InfoButton from '../shared/InfoButton.jsx';
import { getPastedImageFiles } from '../shared/pasteImages.js';
import { useSmartIntake } from './useSmartIntake.js';

/**
 * One upload button that doesn't ask the user to pre-decide lost vs. found -
 * the same shared AI extraction (extractReportFromImages) that already
 * powers both dedicated forms also classifies "reportType", so this page
 * only has to route the result, not duplicate any extraction logic. Creates
 * the record immediately and lands on its detail page, which already has a
 * full edit view for reviewing/correcting fields - no second form to build.
 */
export default function SmartIntakeForm() {
  const { files, setFiles, extracted, busy, reading, readError, analyze, createFromType, creating, cancelReading } =
    useSmartIntake();
  const [postText, setPostText] = useState('');

  function handleUpload(e) {
    const newFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (newFiles.length > 0) setFiles((prev) => [...prev, ...newFiles]);
  }

  function handlePasteText(e) {
    const imageFiles = getPastedImageFiles(e);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    setFiles((prev) => [...prev, ...imageFiles]);
  }

  return (
    <div className="space-y-5 p-4">
      <BackLink to="/">ביטול וחזרה לעמוד הראשי</BackLink>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-800">הוספה חכמה</h1>
        <InfoButton title="איך מוסיפים פוסט על חתול?">
          <p>אפשר לצרף מידע בכמה דרכים, גם ביחד - ואז ללחוץ על "זיהוי אוטומטי":</p>
          <ul className="list-inside list-disc space-y-1">
            <li>העלאת צילום מסך של הפוסט מפייסבוק.</li>
            <li>
              הדבקת הקישור לפוסט או הטקסט שלו בתיבה למטה - שימושי כשאין גישה לשיתוף ישיר מפייסבוק, או כשהכיתוב ארוך
              ונחתך בצילום המסך ("...עוד").
            </li>
            <li>הדבקת תמונה ישירות לתוך התיבה (Ctrl+V) - בלי לשמור אותה קודם לקובץ.</li>
            <li>אם בפוסט כמה תמונות של החתולה, כדאי לצרף גם תמונה בודדת וממוקדת שלה, כדי שהתמונה הראשית תצא מדויקת.</li>
          </ul>
          <p>נזהה אוטומטית אם זה דיווח על חתול שאבד או שנמצא/נראה, ונפתח את הרשומה המתאימה לבדיקה ותיקון.</p>
        </InfoButton>
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <textarea
          className="input mb-3 w-full"
          rows={2}
          placeholder="קישור/טקסט מהפוסט (אפשר גם להדביק כאן תמונה)"
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          onPaste={handlePasteText}
          disabled={busy}
        />

        <EditablePhotoGrid
          existingPhotos={[]}
          newPhotos={files}
          onNewPhotosChange={setFiles}
          label="תמונות שנבחרו"
          addLabel="הוספת תמונות"
        />

        <button
          type="button"
          onClick={() => analyze(postText)}
          disabled={busy || files.length === 0}
          className="mt-3 w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {reading ? 'מזהים פרטים...' : creating ? 'יוצרים רשומה...' : 'זיהוי אוטומטי'}
        </button>

        {reading && <AnalyzingIndicator onCancel={cancelReading} />}
        {creating && <AnalyzingIndicator />}
        {readError && <p className="mt-2 text-sm text-red-600">{readError}</p>}
      </div>

      {extracted && !extracted.reportType && !creating && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="mb-3 text-sm text-amber-800">
            לא הצלחנו לזהות אוטומטית מהפוסט אם זה דיווח על חתול שאבד או שנמצא - איזה מהם זה?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => createFromType(extracted, 'lost', files)}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2 font-medium text-white"
            >
              חתול שאבד
            </button>
            <button
              type="button"
              onClick={() => createFromType(extracted, 'found', files)}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white"
            >
              חתול שנמצא/נראה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
