import { useState } from 'react';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import BackLink from '../shared/BackLink.jsx';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import InfoButton from '../shared/InfoButton.jsx';
import { getPastedImageFiles } from '../shared/pasteImages.js';
import { extractFacebookUrl } from '../shared/facebookLink.js';
import { base64ToFile } from '../shared/base64ToFile.js';
import { fetchFacebookPreview } from '../screenshot-ingestion/fetchFacebookPreview.js';
import { petLabels } from '../shared/petLabels.js';
import DuplicateWarningDialog from '../shared/DuplicateWarningDialog.jsx';
import { findDuplicatesBySourceUrlAnyType } from '../shared/duplicateCheckApi.js';
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
  const {
    files,
    setFiles,
    extracted,
    busy,
    reading,
    readError,
    analyze,
    createFromType,
    creating,
    cancelReading,
    setSourceUrl,
    duplicateMatches,
    duplicateRecordType,
    continueCreateAnyway,
    cancelDuplicateCreate,
  } = useSmartIntake();
  const [postText, setPostText] = useState('');
  const [fetchingLink, setFetchingLink] = useState(false);
  const [linkFetchError, setLinkFetchError] = useState('');
  // Separate from the hook's own duplicateMatches (the pre-creation gate,
  // triggered once extraction has classified lost vs. found) - this is an
  // earlier, type-unaware heads-up shown right after pulling in a link, so
  // it needs its own state and checks both collections at once (see
  // findDuplicatesBySourceUrlAnyType).
  const [linkDuplicateMatches, setLinkDuplicateMatches] = useState(null);
  const detectedFbUrl = extractFacebookUrl(postText);

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

  // Pulls the post's own public preview text/photo straight from a pasted
  // Facebook link (see fetchFacebookPreview.js) - no login needed, since
  // it's the same preview data Facebook already serves to generate a link's
  // rich preview elsewhere. Works for public posts only; private/restricted
  // ones come back empty, same as they would for anyone not already a
  // member.
  async function handleFetchFromLink() {
    if (!detectedFbUrl) return;
    setFetchingLink(true);
    setLinkFetchError('');
    setSourceUrl(detectedFbUrl);
    // Early heads-up, in parallel with the actual fetch below - lost/found
    // isn't known yet at this point, so this checks both collections.
    findDuplicatesBySourceUrlAnyType(detectedFbUrl).then((matches) => {
      if (matches.length > 0) setLinkDuplicateMatches(matches);
    });
    try {
      const preview = await fetchFacebookPreview(detectedFbUrl);
      if (preview.text && !postText.includes(preview.text)) {
        setPostText((prev) => `${prev}\n${preview.text}`.trim());
      }
      if (preview.groupName) {
        setPostText((prev) => `${prev}\n(פורסם בקבוצת פייסבוק: ${preview.groupName})`.trim());
      }
      if (preview.imageBase64) {
        setFiles((prev) => [...prev, base64ToFile(preview.imageBase64, preview.imageMimeType, 'facebook-preview.jpg')]);
      } else if (!preview.text) {
        setLinkFetchError('לא הצלחנו למשוך מידע מהקישור הזה (יכול לקרות בפוסטים פרטיים) - אפשר להמשיך עם צילום מסך.');
      }
    } catch {
      setLinkFetchError('לא הצלחנו למשוך מידע מהקישור הזה (יכול לקרות בפוסטים פרטיים) - אפשר להמשיך עם צילום מסך.');
    } finally {
      setFetchingLink(false);
    }
  }

  return (
    <div className="space-y-5 p-4">
      <BackLink to="/">ביטול וחזרה לעמוד הראשי</BackLink>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-800">הוספה חכמה</h1>
        <InfoButton title="איך מוסיפים פוסט על חתול או כלב?">
          <p>אפשר לצרף מידע בכמה דרכים, גם ביחד - ואז ללחוץ על "זיהוי אוטומטי":</p>
          <ul className="list-inside list-disc space-y-1">
            <li>העלאת צילום מסך של הפוסט מפייסבוק.</li>
            <li>
              הדבקת הטקסט של הפוסט עצמו בתיבה למטה - שימושי כשהכיתוב ארוך ונחתך בצילום המסך ("...עוד").
            </li>
            <li>
              הדבקת קישור לפוסט בתיבה - יופיע כפתור "משיכת מידע מהקישור" שמנסה להביא את הטקסט והתמונה של הפוסט
              ישירות (עובד רק בפוסטים פומביים, לא בקבוצות סגורות).
            </li>
            <li>הדבקת תמונה ישירות לתוך התיבה (Ctrl+V) - בלי לשמור אותה קודם לקובץ.</li>
            <li>אם בפוסט כמה תמונות של החיה, כדאי לצרף גם תמונה בודדת וממוקדת שלה, כדי שהתמונה הראשית תצא מדויקת.</li>
          </ul>
          <p>נזהה אוטומטית אם זה חתול או כלב, ואם זה דיווח על אבידה או מציאה, ונפתח את הרשומה המתאימה לבדיקה ותיקון.</p>
        </InfoButton>
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <textarea
          className="input mb-3 w-full"
          rows={2}
          placeholder="קישור או טקסט מהפוסט - אפשר גם להדביק כאן תמונה"
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          onPaste={handlePasteText}
          disabled={busy}
        />
        {detectedFbUrl && (
          <button
            type="button"
            onClick={handleFetchFromLink}
            disabled={fetchingLink || busy}
            className="mb-3 w-full rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 disabled:opacity-50"
          >
            {fetchingLink ? 'מושכים מידע מהקישור...' : 'משיכת מידע מהקישור (טקסט + תמונה)'}
          </button>
        )}
        {linkFetchError && <p className="mb-2 text-xs text-red-600">{linkFetchError}</p>}

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
          <p className="mb-3 text-sm text-amber-800">לא הצלחנו לזהות אוטומטית אם זה דיווח על אבידה או מציאה - איזה מהם זה?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => createFromType(extracted, 'lost', files)}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2 font-medium text-white"
            >
              {petLabels(extracted.species).lostButton}
            </button>
            <button
              type="button"
              onClick={() => createFromType(extracted, 'found', files)}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white"
            >
              {petLabels(extracted.species).foundButton}
            </button>
          </div>
        </div>
      )}

      {duplicateMatches && (
        <DuplicateWarningDialog
          recordType={duplicateRecordType}
          matches={duplicateMatches}
          onContinue={continueCreateAnyway}
          onCancel={cancelDuplicateCreate}
        />
      )}

      {!duplicateMatches && linkDuplicateMatches && (
        <DuplicateWarningDialog
          matches={linkDuplicateMatches}
          mode="info"
          onCancel={() => setLinkDuplicateMatches(null)}
        />
      )}
    </div>
  );
}
