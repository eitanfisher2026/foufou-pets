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
import { useConfirm } from '../shared/useConfirm.jsx';
import { getPastedImageFiles } from '../shared/pasteImages.js';
import { useColorOptions } from '../shared/useColorOptions.js';
import { CAT_SIZES, CAT_FUR_TYPES, COLLAR_COLORS, CAT_CONDITIONS } from '../shared/collections.js';
import { createFoundReport } from './foundReportApi.js';
import { EMPTY_FOUND_FIELDS, mergeExtractedFoundFields } from './foundFieldMapping.js';

export default function FoundReportForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read, cancel: cancelReading } = useScreenshotReader();
  const { confirm, dialog } = useConfirm();
  const catColors = useColorOptions();

  const [fields, setFields] = useState(EMPTY_FOUND_FIELDS);
  const [photos, setPhotos] = useState([]);
  const [screenshotFiles, setScreenshotFiles] = useState([]);
  const [hasAutoMainPhoto, setHasAutoMainPhoto] = useState(false);
  const [uploadNotice, setUploadNotice] = useState('');
  const [postText, setPostText] = useState('');
  const [source, setSource] = useState('manual');
  const [extracted, setExtracted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function processScreenshots(newFiles) {
    if (newFiles.length === 0) return;

    // A second, separate upload is ambiguous: it could be another screenshot
    // of the same continued post (caption cut off, "...עוד"), or a mistake -
    // someone uploading a different cat's screenshot into this same report.
    // Selecting several files together in one go is unambiguous (that's the
    // normal same-post case) and isn't gated.
    if (screenshotFiles.length > 0) {
      const samePost = await confirm(
        'כבר הועלתה תמונה קודם לדיווח הזה. התמונה החדשה שייכת לאותה חתולה ולאותו פוסט?',
        { confirmLabel: 'כן, אותה חתולה', cancelLabel: 'לא, זו חתולה אחרת', danger: false }
      );
      if (!samePost) {
        setUploadNotice('כדי לדווח על חתול נוסף, יש לסיים ולשלוח קודם את הדיווח הנוכחי, ואז לפתוח דיווח חדש עבורו.');
        return;
      }
      setUploadNotice('');
    }

    const allScreenshots = [...screenshotFiles, ...newFiles];
    setScreenshotFiles(allScreenshots);
    setSource('screenshot');
    setPhotos((prev) => [...prev, ...newFiles]);

    try {
      const result = await read(allScreenshots, postText);
      setFields((prev) => mergeExtractedFoundFields(result, prev));
      setExtracted(true);

      const mainPhoto = await extractMainPhoto(allScreenshots, result.mainPhotoRegion);
      if (mainPhoto) {
        setPhotos((prev) => [mainPhoto, ...(hasAutoMainPhoto ? prev.slice(1) : prev)]);
        setHasAutoMainPhoto(true);
      }
    } catch {
      // error already surfaced via readError
    }
  }

  async function handleScreenshotUpload(e) {
    const newFiles = Array.from(e.target.files || []);
    e.target.value = '';
    await processScreenshots(newFiles);
  }

  async function handlePasteText(e) {
    const imageFiles = getPastedImageFiles(e);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    await processScreenshots(imageFiles);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const reportId = await createFoundReport({ ...fields, source }, photos, user.uid);
      navigate(`/found/${reportId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-4">
      <BackLink to="/">ביטול וחזרה לעמוד הראשי</BackLink>
      <h1 className="text-xl font-bold text-slate-800">דיווח על חתול שנראה / נמצא</h1>
      <p className="text-sm text-slate-500">
        אם ראית פוסט בפייסבוק על חתול - אין צורך להכיר את מי שכתב אותו. פשוט העלה/י צילום מסך.
      </p>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <label className="mb-2 block text-sm font-medium text-slate-600">
          צילום/י מסך של הפוסט (אפשר כמה תמונות, כולל אם הכיתוב נמשך ב"עוד"). אם בפוסט כמה תמונות של החתולה, כדאי
          לצרף גם תמונה בודדת וממוקדת שלה בנוסף לצילום המסך, כדי שהתמונה הראשית תצא מדויקת.
        </label>
        <label className="mb-1 mt-3 block text-sm font-medium text-slate-600">
          אין גישה לאפליקציית פייסבוק לשיתוף ישיר? אפשר להדביק כאן את הקישור לפוסט או את הטקסט שלו (לא חובה). אפשר
          גם להדביק כאן ישירות תמונה/צילום מסך (Ctrl+V)
        </label>
        <textarea
          className="input mb-2 w-full"
          rows={2}
          placeholder="קישור או טקסט מהפוסט, או הדבקת תמונה"
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          onPaste={handlePasteText}
        />
        <input type="file" accept="image/*" multiple onChange={handleScreenshotUpload} />
        {reading && <AnalyzingIndicator onCancel={cancelReading} />}
        {readError && <p className="mt-2 text-sm text-red-600">{readError}</p>}
        {uploadNotice && <p className="mt-2 text-sm text-amber-700">{uploadNotice}</p>}

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

      <FormSection title="פרטי חתול">
        <Field label="שם החתולה (אם ידוע) / כותרת (כך יופיע הדיווח ברשימה)">
          <input
            className="input"
            value={fields.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder='שם אם ידוע, אחרת תיאור כמו "חתול שחור-לבן ליד הפארק"'
          />
        </Field>

        <Field label="מצב החתול" inline>
          <select className="input w-36" value={fields.condition} onChange={(e) => setField('condition', e.target.value)}>
            {CAT_CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="צבע" inline>
          <select className="input w-36" value={fields.color} onChange={(e) => setField('color', e.target.value)}>
            <option value="">בחר/י צבע</option>
            {catColors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
              <select className="input w-36" value={fields.collarColor} onChange={(e) => setField('collarColor', e.target.value)}>
                <option value="">בחר/י צבע</option>
                {COLLAR_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
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

        <Field label="גזע" inline>
          <input
            className="input w-36"
            value={fields.breed}
            onChange={(e) => setField('breed', e.target.value)}
            placeholder="אם ידוע"
          />
        </Field>

        <Field label="סוג פרווה" inline>
          <select className="input w-36" value={fields.furType} onChange={(e) => setField('furType', e.target.value)}>
            <option value="">בחר/י</option>
            {CAT_FUR_TYPES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="גודל" inline>
          <select className="input w-36" value={fields.size} onChange={(e) => setField('size', e.target.value)}>
            <option value="">בחר/י</option>
            {CAT_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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
            placeholder='למשל "חתולים אבודים ונמצאים - תל אביב"'
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
      </FormSection>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'שולחים...' : 'שליחת הדיווח'}
      </button>
      {dialog}
    </form>
  );
}
