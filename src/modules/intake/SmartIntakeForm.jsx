import { useState } from 'react';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import BackLink from '../shared/BackLink.jsx';
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
  const { files, extracted, busy, reading, readError, handleFiles, createFromType, creating, cancelReading } =
    useSmartIntake();
  const [postText, setPostText] = useState('');

  async function handleUpload(e) {
    const newFiles = Array.from(e.target.files || []);
    e.target.value = '';
    await handleFiles(newFiles, postText);
  }

  return (
    <div className="space-y-5 p-4">
      <BackLink to="/">ביטול וחזרה לעמוד הראשי</BackLink>
      <h1 className="text-xl font-bold text-slate-800">הוספה חכמה</h1>
      <p className="text-sm text-slate-500">
        העלה/י צילום מסך של פוסט על חתול - נזהה אוטומטית אם זה דיווח על חתול שאבד או שנמצא/נראה, ונפתח את הרשומה
        המתאימה כדי שתוכל/י לבדוק ולתקן את הפרטים. אם בפוסט כמה תמונות של החתולה, כדאי לצרף גם תמונה בודדת וממוקדת
        שלה בנוסף לצילום המסך, כדי שהתמונה הראשית תצא מדויקת.
      </p>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <label className="mb-1 block text-sm font-medium text-slate-600">
          אין גישה לאפליקציית פייסבוק לשיתוף ישיר? אפשר להדביק כאן את הקישור לפוסט או את הטקסט שלו (לא חובה) -
          יעזור להשלים פרטים גם אם הם נחתכים בצילום המסך
        </label>
        <textarea
          className="input mb-3 w-full"
          rows={2}
          placeholder="קישור או טקסט מהפוסט"
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          disabled={busy}
        />
        <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={busy} />
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
