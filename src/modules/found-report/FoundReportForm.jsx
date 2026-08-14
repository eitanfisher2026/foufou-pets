import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { extractMainPhoto } from '../shared/cropPhoto.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import FormSection from '../shared/FormSection.jsx';
import BackLink from '../shared/BackLink.jsx';
import Field from '../shared/Field.jsx';
import InfoButton from '../shared/InfoButton.jsx';
import { getPastedImageFiles } from '../shared/pasteImages.js';
import { extractFacebookUrl } from '../shared/facebookLink.js';
import { base64ToFile } from '../shared/base64ToFile.js';
import { fetchFacebookPreview } from '../screenshot-ingestion/fetchFacebookPreview.js';
import { useColorOptions } from '../shared/useColorOptions.js';
import { useDogBreedOptions } from '../shared/useDogBreedOptions.js';
import { petLabels } from '../shared/petLabels.js';
import { findDuplicatesBySourceUrl } from '../shared/duplicateCheckApi.js';
import DuplicateWarningDialog from '../shared/DuplicateWarningDialog.jsx';
import SelectField from '../shared/SelectField.jsx';
import { CAT_SIZES, CAT_FUR_TYPES, COLLAR_COLORS, CAT_CONDITIONS, SPECIES } from '../shared/collections.js';
import { createFoundReport } from './foundReportApi.js';
import { EMPTY_FOUND_FIELDS, mergeExtractedFoundFields } from './foundFieldMapping.js';

export default function FoundReportForm() {
  const { user, preferredSpecies } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read, cancel: cancelReading } = useScreenshotReader();

  // Species is fixed to whichever mode this person is currently working in
  // (see AuthProvider/SpeciesToggle on the dashboard) - no picker here, since
  // switching modes mid-form would be surprising. A screenshot's own
  // AI-detected species can still override it (see mergeExtractedFoundFields).
  const [fields, setFields] = useState(() => ({ ...EMPTY_FOUND_FIELDS, species: preferredSpecies }));
  const labels = petLabels(fields.species);
  const colorOptions = useColorOptions(fields.species);
  const dogBreedOptions = useDogBreedOptions();
  const [photos, setPhotos] = useState([]);
  const [screenshotFiles, setScreenshotFiles] = useState([]);
  const [hasAutoMainPhoto, setHasAutoMainPhoto] = useState(false);
  const [postText, setPostText] = useState('');
  const [source, setSource] = useState('manual');
  const [extracted, setExtracted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingLink, setFetchingLink] = useState(false);
  const [linkFetchError, setLinkFetchError] = useState('');
  const [duplicateMatches, setDuplicateMatches] = useState(null);
  const [duplicateDialogMode, setDuplicateDialogMode] = useState('submit');
  const detectedFbUrl = extractFacebookUrl(postText);

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  // Adding a screenshot (by picking or pasting) only collects it - it does
  // not analyze anything by itself, so someone can paste a photo, then
  // paste the post's link, then add another photo, and only then run one
  // extraction over everything they've gathered via the button below,
  // instead of the first paste jumping the gun on a still-incomplete set.
  function addScreenshots(newFiles) {
    if (newFiles.length === 0) return;
    setScreenshotFiles((prev) => [...prev, ...newFiles]);
    setSource('screenshot');
    setPhotos((prev) => [...prev, ...newFiles]);
  }

  function handleScreenshotUpload(e) {
    const newFiles = Array.from(e.target.files || []);
    e.target.value = '';
    addScreenshots(newFiles);
  }

  function handlePasteText(e) {
    const imageFiles = getPastedImageFiles(e);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    addScreenshots(imageFiles);
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
    setField('sourceUrl', detectedFbUrl);
    // Early heads-up, in parallel with the actual fetch below - no need to
    // wait for someone to fill in the whole form before finding out a post
    // with this exact link was already entered.
    findDuplicatesBySourceUrl('found', detectedFbUrl).then((matches) => {
      if (matches.length > 0) {
        setDuplicateDialogMode('info');
        setDuplicateMatches(matches);
      }
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
        addScreenshots([base64ToFile(preview.imageBase64, preview.imageMimeType, 'facebook-preview.jpg')]);
      } else if (!preview.text) {
        setLinkFetchError('לא הצלחנו למשוך מידע מהקישור הזה (קורה כשתוכן הקבוצה גלוי לחברים בלבד) - אפשר להמשיך עם צילום מסך.');
      }
    } catch {
      setLinkFetchError('לא הצלחנו למשוך מידע מהקישור הזה (קורה כשתוכן הקבוצה גלוי לחברים בלבד) - אפשר להמשיך עם צילום מסך.');
    } finally {
      setFetchingLink(false);
    }
  }

  async function handleAnalyze() {
    if (screenshotFiles.length === 0) return;
    try {
      const result = await read(screenshotFiles, postText);
      setFields((prev) => mergeExtractedFoundFields(result, prev));
      setExtracted(true);

      const mainPhoto = await extractMainPhoto(screenshotFiles, result.mainPhotoRegion);
      if (mainPhoto) {
        setPhotos((prev) => [mainPhoto, ...(hasAutoMainPhoto ? prev.slice(1) : prev)]);
        setHasAutoMainPhoto(true);
      }
    } catch {
      // error already surfaced via readError
    }
  }

  async function createReport() {
    setSubmitting(true);
    try {
      const reportId = await createFoundReport({ ...fields, source }, photos, user);
      navigate(`/found/${reportId}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Only checks for a duplicate at submit time, on the one signal that
  // exists so far (same source URL) - see duplicateCheckApi.js for why this
  // is deliberately step one of a check that may grow more conditions.
  async function handleSubmit(e) {
    e.preventDefault();
    if (fields.sourceUrl?.trim()) {
      setSubmitting(true);
      let matches = [];
      try {
        matches = await findDuplicatesBySourceUrl('found', fields.sourceUrl);
      } finally {
        setSubmitting(false);
      }
      if (matches.length > 0) {
        setDuplicateDialogMode('submit');
        setDuplicateMatches(matches);
        return;
      }
    }
    await createReport();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-4">
      <BackLink to="/">ביטול וחזרה לעמוד הראשי</BackLink>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-800">{labels.foundReportTitle}</h1>
        <InfoButton title={labels.infoButtonTitle}>
          <p>אין צורך להכיר את מי שכתב את הפוסט. אפשר לצרף מידע בכמה דרכים, גם ביחד - ואז ללחוץ על "זיהוי אוטומטי":</p>
          <ul className="list-inside list-disc space-y-1">
            <li>העלאת צילום מסך של הפוסט מפייסבוק - חלק מהשדות יתמלאו אוטומטית.</li>
            <li>
              הדבקת הטקסט של הפוסט עצמו בתיבה למטה - שימושי כשהכיתוב ארוך ונחתך בצילום המסך ("...עוד").
            </li>
            <li>
              הדבקת קישור לפוסט בתיבה - יופיע כפתור "משיכת מידע מהקישור" שמנסה להביא את הטקסט והתמונה של הפוסט
              ישירות (עובד רק בפוסטים פומביים, לא בקבוצות סגורות).
            </li>
            <li>הדבקת תמונה ישירות לתוך התיבה (Ctrl+V) - בלי לשמור אותה קודם לקובץ.</li>
            <li>אם בפוסט כמה תמונות של {labels.animalDef}, כדאי לצרף גם תמונה בודדת וממוקדת שלה, כדי שהתמונה הראשית תצא מדויקת.</li>
          </ul>
        </InfoButton>
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <textarea
          className="input mb-2 w-full"
          rows={2}
          placeholder="קישור או טקסט מהפוסט - אפשר גם להדביק כאן תמונה"
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          onPaste={handlePasteText}
        />
        {detectedFbUrl && (
          <button
            type="button"
            onClick={handleFetchFromLink}
            disabled={fetchingLink}
            className="mb-2 w-full rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 disabled:opacity-50"
          >
            {fetchingLink ? 'מושכים מידע מהקישור...' : 'משיכת מידע מהקישור (טקסט + תמונה)'}
          </button>
        )}
        {linkFetchError && <p className="mb-2 text-xs text-red-600">{linkFetchError}</p>}
        <input type="file" accept="image/*" multiple onChange={handleScreenshotUpload} />

        {screenshotFiles.length > 0 && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={reading}
            className="mt-3 w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {reading ? 'מזהים פרטים...' : `זיהוי אוטומטי (${screenshotFiles.length} תמונות)`}
          </button>
        )}
        {reading && <AnalyzingIndicator onCancel={cancelReading} />}
        {readError && <p className="mt-2 text-sm text-red-600">{readError}</p>}

        <div className="mt-4 border-t border-slate-200 pt-4">
          <EditablePhotoGrid
            existingPhotos={[]}
            newPhotos={photos}
            onNewPhotosChange={setPhotos}
            label="תמונות שיתווספו לדיווח"
            addLabel="יש לך גם תמונה רגילה (לא צילום מסך)? אפשר להוסיף אותה כאן"
          />
        </div>
      </div>

      {extracted && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          מילאנו את מה שהצלחנו לזהות מהתמונה. בדוק/י ותקן/י לפני השליחה - חלק מהשדות עשויים להיות חסרים.
        </p>
      )}

      <FormSection title={labels.petDetailsSection}>
        <Field label={`${labels.nameLabel} (אם ידוע) / כותרת (כך יופיע הדיווח ברשימה)`}>
          <input
            className="input"
            value={fields.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder={`שם אם ידוע, אחרת תיאור כמו "${labels.animal} שחור-לבן ליד הפארק"`}
          />
        </Field>

        <Field label={labels.conditionLabel} inline>
          <SelectField
            className="w-36"
            label={labels.conditionLabel}
            allowClear={false}
            value={fields.condition}
            onChange={(v) => setField('condition', v)}
            options={CAT_CONDITIONS}
          />
        </Field>

        <Field label="צבע" inline>
          <SelectField
            className="w-36"
            label="בחירת צבע"
            placeholder="בחר/י צבע"
            value={fields.color}
            onChange={(v) => setField('color', v)}
            options={colorOptions}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={fields.ageClass === 'kitten'}
            onChange={(e) => setField('ageClass', e.target.checked ? 'kitten' : 'adult')}
          />
          גור
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!!fields.hasCollar} onChange={(e) => setField('hasCollar', e.target.checked)} />
          קולר
        </label>

        {fields.hasCollar && (
          <>
            <Field label="צבע הקולר" inline>
              <SelectField
                className="w-36"
                label="בחירת צבע קולר"
                placeholder="בחר/י צבע"
                value={fields.collarColor}
                onChange={(v) => setField('collarColor', v)}
                options={COLLAR_COLORS}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!fields.collarHasBell}
                onChange={(e) => setField('collarHasBell', e.target.checked)}
              />
              יש פעמון על הקולר
            </label>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={!!fields.hasClippedEar}
            onChange={(e) => setField('hasClippedEar', e.target.checked)}
          />
          אוזן קטומה
        </label>

        <Field label="סימנים מיוחדים (סימן אחד בכל שורה - כולל תיאור צבע/תבניות וזנב שעיר אם רלוונטי)">
          <textarea
            className="input"
            rows={3}
            placeholder={'לדוגמה:\nנקודה שחורה ליד האף\nאוזניים קצרות מהרגיל\nזנב שעיר/פלומתי במיוחד'}
            value={fields.markings}
            onChange={(e) => setField('markings', e.target.value)}
          />
        </Field>

        <Field label={labels.breedLabel} inline>
          {fields.species === SPECIES.DOG ? (
            <SelectField
              className="w-36"
              label="בחירת גזע"
              placeholder="בחר/י גזע"
              value={fields.breed}
              onChange={(v) => setField('breed', v)}
              options={dogBreedOptions}
            />
          ) : (
            <input
              className="input w-36"
              value={fields.breed}
              onChange={(e) => setField('breed', e.target.value)}
              placeholder="אם ידוע"
            />
          )}
        </Field>

        <Field label="משקל (ק״ג, אם ידוע)" inline>
          <input
            type="number"
            step="0.1"
            min="0"
            className="input w-36"
            value={fields.weightKg}
            onChange={(e) => setField('weightKg', e.target.value)}
          />
        </Field>

        <Field label="מספר שבב (אם ידוע)" inline>
          <input className="input w-36" value={fields.microchipNumber} onChange={(e) => setField('microchipNumber', e.target.value)} />
        </Field>

        <Field label="סוג פרווה" inline>
          <SelectField
            className="w-36"
            label="בחירת סוג פרווה"
            value={fields.furType}
            onChange={(v) => setField('furType', v)}
            options={CAT_FUR_TYPES}
          />
        </Field>

        <Field label="גודל" inline>
          <SelectField className="w-36" label="בחירת גודל" value={fields.size} onChange={(v) => setField('size', v)} options={CAT_SIZES} />
        </Field>
      </FormSection>

      <FormSection title="נראה לאחרונה">
        <Field label="עיר">
          <input className="input" value={fields.city} onChange={(e) => setField('city', e.target.value)} />
        </Field>

        <Field label="שכונה (אפשר גם פרטי מיקום נוספים, כמו רחוב או ציון דרך)">
          <input className="input" value={fields.neighborhood} onChange={(e) => setField('neighborhood', e.target.value)} />
        </Field>

        <Field label="מועד הראייה/המציאה (כפי שידוע/נכתב)">
          <input className="input" value={fields.dateText} onChange={(e) => setField('dateText', e.target.value)} />
        </Field>

        <Field label="תאריך מדויק (אם ידוע - משפר את איכות ההתאמות)">
          <input
            type="date"
            className="input"
            value={fields.seenDate}
            onChange={(e) => {
              setField('seenDate', e.target.value);
              setField('seenDateApprox', false);
            }}
          />
          <label className="mt-1 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={!!fields.seenDateApprox}
              onChange={(e) => setField('seenDateApprox', e.target.checked)}
            />
            תאריך משוער בלבד (חושב מתיאור יחסי כמו "לפני יום", לא מתאריך מפורש)
          </label>
        </Field>
      </FormSection>

      <FormSection title="פרטי קשר">
        <Field label="שם איש קשר (אם קיים בפוסט)">
          <input className="input" value={fields.contactName} onChange={(e) => setField('contactName', e.target.value)} />
        </Field>

        <Field label="טלפון (אם קיים בפוסט)">
          <input className="input" value={fields.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} />
        </Field>

        <Field label="הערות נוספות">
          <textarea className="input" value={fields.notes} onChange={(e) => setField('notes', e.target.value)} />
        </Field>
      </FormSection>

      <FormSection title="מקור מידע">
        <Field label="מקור המידע (שם הקבוצה)">
          <input
            className="input"
            value={fields.sourceGroupName}
            onChange={(e) => setField('sourceGroupName', e.target.value)}
            placeholder={labels.groupPlaceholder}
          />
        </Field>

        <Field label="מי כתב את הפוסט המקורי">
          <input
            className="input"
            value={fields.originalPosterName}
            onChange={(e) => setField('originalPosterName', e.target.value)}
          />
        </Field>

        <Field label="מי שיתף את הפוסט לקבוצה הזו (אם שונה מהכותב)">
          <input className="input" value={fields.sharedByName} onChange={(e) => setField('sharedByName', e.target.value)} />
        </Field>

        <Field label="מתי פורסם (כפי שכתוב בפוסט)">
          <input className="input" value={fields.postAgeText} onChange={(e) => setField('postAgeText', e.target.value)} />
        </Field>

        <Field label="קישור לפוסט המקורי">
          <input
            className="input"
            type="url"
            dir="ltr"
            value={fields.sourceUrl}
            onChange={(e) => setField('sourceUrl', e.target.value)}
            placeholder="https://www.facebook.com/..."
          />
        </Field>
      </FormSection>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'שולחים...' : 'שליחת הדיווח'}
      </button>

      {duplicateMatches && (
        <DuplicateWarningDialog
          recordType="found"
          matches={duplicateMatches}
          mode={duplicateDialogMode}
          onContinue={() => {
            setDuplicateMatches(null);
            // The early "info" check (from the link-fetch button) is just a
            // heads-up while the form is still being filled in - only the
            // later submit-time check should actually create the record.
            if (duplicateDialogMode === 'submit') createReport();
          }}
          onCancel={() => {
            setDuplicateMatches(null);
            // The early "info" check has nothing pending to just dismiss
            // back to - "cancel" there means abandoning the add attempt.
            // The later submit-time check just closes back onto the
            // already-filled-in form, so nothing typed is lost.
            if (duplicateDialogMode === 'info') navigate('/');
          }}
        />
      )}
    </form>
  );
}
