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
import { useColorOptions } from '../shared/useColorOptions.js';
import { CAT_SIZES, CAT_FUR_TYPES, COLLAR_COLORS } from '../shared/collections.js';
import { createLostCase } from './lostReportApi.js';
import { EMPTY_LOST_FIELDS, mergeExtractedLostFields } from './lostFieldMapping.js';

export default function LostReportForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read, cancel: cancelReading } = useScreenshotReader();
  const { confirm, dialog } = useConfirm();
  const catColors = useColorOptions();

  const [fields, setFields] = useState(EMPTY_LOST_FIELDS);
  const [photos, setPhotos] = useState([]);
  const [screenshotFiles, setScreenshotFiles] = useState([]);
  const [hasAutoMainPhoto, setHasAutoMainPhoto] = useState(false);
  const [uploadNotice, setUploadNotice] = useState('');
  const [source, setSource] = useState('manual');
  const [submitting, setSubmitting] = useState(false);

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleScreenshotUpload(e) {
    const newFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (newFiles.length === 0) return;

    // A second, separate upload is ambiguous: it could be another screenshot
    // of the same continued post (caption cut off, "...עוד"), or a mistake -
    // someone uploading a different cat's screenshot into this same form.
    // Selecting several files together in one go is unambiguous (that's the
    // normal same-post case) and isn't gated.
    if (screenshotFiles.length > 0) {
      const samePost = await confirm(
        'כבר הועלתה תמונה קודם לתיק הזה. התמונה החדשה שייכת לאותה חתולה ולאותו פוסט?',
        { confirmLabel: 'כן, אותה חתולה', cancelLabel: 'לא, זו חתולה אחרת', danger: false }
      );
      if (!samePost) {
        setUploadNotice('כדי לדווח על חתול נוסף, יש לסיים ולפתוח קודם את התיק הנוכחי, ואז לפתוח תיק חדש עבורו.');
        return;
      }
      setUploadNotice('');
    }

    const allScreenshots = [...screenshotFiles, ...newFiles];
    setScreenshotFiles(allScreenshots);
    setSource('screenshot');
    setPhotos((prev) => [...prev, ...newFiles]);

    try {
      const extracted = await read(allScreenshots);
      setFields((prev) => mergeExtractedLostFields(extracted, prev));

      const mainPhoto = await extractMainPhoto(allScreenshots, extracted.mainPhotoRegion);
      if (mainPhoto) {
        setPhotos((prev) => [mainPhoto, ...(hasAutoMainPhoto ? prev.slice(1) : prev)]);
        setHasAutoMainPhoto(true);
      }
    } catch {
      // error already surfaced via readError; user can fill in manually
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const caseId = await createLostCase({ ...fields, source }, photos, user.uid);
      navigate(`/lost/${caseId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-4">
      <BackLink to="/">ביטול וחזרה לעמוד הראשי</BackLink>
      <h1 className="text-xl font-bold text-slate-800">פתיחת תיק חיפוש - חתול אבד</h1>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <label className="mb-2 block text-sm font-medium text-slate-600">
          יש לך צילום מסך של פוסט מפייסבוק על החתולה? אפשר להעלות אותו וחלק מהשדות יתמלאו אוטומטית. אם בפוסט כמה
          תמונות של החתולה, כדאי לצרף גם תמונה בודדת וממוקדת שלה בנוסף לצילום המסך, כדי שהתמונה הראשית תצא מדויקת.
        </label>
        <input type="file" accept="image/*" multiple onChange={handleScreenshotUpload} />
        {reading && <AnalyzingIndicator onCancel={cancelReading} />}
        {readError && <p className="mt-2 text-sm text-red-600">{readError}</p>}
        {uploadNotice && <p className="mt-2 text-sm text-amber-700">{uploadNotice}</p>}

        <div className="mt-4 border-t border-slate-200 pt-4">
          <EditablePhotoGrid
            existingPhotos={[]}
            newPhotos={photos}
            onNewPhotosChange={setPhotos}
            label="תמונות שיתווספו לתיק"
            addLabel="יש לך גם תמונה רגילה (לא צילום מסך)? אפשר להוסיף אותה כאן"
          />
        </div>
      </div>

      <FormSection title="פרטי חתול">
        <Field label="שם החתולה">
          <input className="input" value={fields.name} onChange={(e) => setField('name', e.target.value)} />
        </Field>

        <Field label="צבע" inline>
          <select className="input" value={fields.color} onChange={(e) => setField('color', e.target.value)}>
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
          <input type="checkbox" checked={fields.hasCollar} onChange={(e) => setField('hasCollar', e.target.checked)} />
          לובשת קולר/רתמה
        </label>

        {fields.hasCollar && (
          <>
            <Field label="צבע הקולר" inline>
              <select className="input" value={fields.collarColor} onChange={(e) => setField('collarColor', e.target.value)}>
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
                checked={fields.collarHasBell}
                onChange={(e) => setField('collarHasBell', e.target.checked)}
              />
              יש פעמון על הקולר
            </label>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={fields.hasClippedEar}
            onChange={(e) => setField('hasClippedEar', e.target.checked)}
          />
          אוזן קטומה (סימון סטנדרטי לאחר עיקור/סירוס - נפוץ בחתולי רחוב)
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
            className="input w-28"
            value={fields.breed}
            onChange={(e) => setField('breed', e.target.value)}
            placeholder="אם ידוע"
          />
        </Field>

        <Field label="סוג פרווה" inline>
          <select className="input" value={fields.furType} onChange={(e) => setField('furType', e.target.value)}>
            <option value="">בחר/י</option>
            {CAT_FUR_TYPES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="גודל" inline>
          <select className="input" value={fields.size} onChange={(e) => setField('size', e.target.value)}>
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

        <Field label="מועד האובדן (כפי שידוע/נכתב)">
          <input className="input" value={fields.lastSeenAt} onChange={(e) => setField('lastSeenAt', e.target.value)} />
        </Field>

        <Field label="תאריך מדויק (אם ידוע - משפר את איכות ההתאמות)">
          <input
            type="date"
            className="input"
            value={fields.lastSeenDate}
            onChange={(e) => {
              setField('lastSeenDate', e.target.value);
              setField('lastSeenDateApprox', false);
            }}
          />
          <label className="mt-1 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={!!fields.lastSeenDateApprox}
              onChange={(e) => setField('lastSeenDateApprox', e.target.checked)}
            />
            תאריך משוער בלבד (חושב מתיאור יחסי כמו "לפני יום", לא מתאריך מפורש)
          </label>
        </Field>
      </FormSection>

      <FormSection title="פרטי קשר">
        <Field label="שם איש קשר">
          <input className="input" value={fields.contactName} onChange={(e) => setField('contactName', e.target.value)} />
        </Field>

        <Field label="טלפון">
          <input className="input" value={fields.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} />
        </Field>

        <Field label="הערות נוספות">
          <textarea className="input" value={fields.notes} onChange={(e) => setField('notes', e.target.value)} />
        </Field>
      </FormSection>

      <FormSection title="מקור מידע">
        <Field label="מקור המידע (שם הקבוצה) - אם שונה מדיווח אישי">
          <input
            className="input"
            value={fields.sourceGroupName}
            onChange={(e) => setField('sourceGroupName', e.target.value)}
            placeholder='למשל "חתולים אבודים ונמצאים - תל אביב"'
          />
        </Field>

        <Field label="מי כתב את הפוסט המקורי (אם לא הבעלים עצמם)">
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
        {submitting ? 'פותחים תיק...' : 'פתיחת תיק חיפוש'}
      </button>
      {dialog}
    </form>
  );
}
