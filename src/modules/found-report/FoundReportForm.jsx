import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { extractMainPhoto } from '../shared/cropPhoto.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import { useConfirm } from '../shared/useConfirm.jsx';
import { CAT_COLORS, CAT_SIZES, CAT_AGE_CLASSES, COLLAR_COLORS, CAT_CONDITIONS } from '../shared/collections.js';
import { createFoundReport } from './foundReportApi.js';

const EMPTY_FIELDS = {
  title: '',
  color: '',
  colorDescription: '',
  size: '',
  ageClass: '',
  markings: '',
  hasCollar: null,
  collarColor: '',
  collarHasBell: null,
  hasClippedEar: null,
  city: '',
  neighborhood: '',
  location: '',
  dateText: '',
  seenDate: '',
  seenDateApprox: false,
  condition: 'seen_only',
  contactName: '',
  contactPhone: '',
  notes: '',
  sourceGroupName: '',
  originalPosterName: '',
  sharedByName: '',
  postAgeText: '',
};

export default function FoundReportForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read } = useScreenshotReader();
  const { confirm, dialog } = useConfirm();

  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [photos, setPhotos] = useState([]);
  const [screenshotFiles, setScreenshotFiles] = useState([]);
  const [hasAutoMainPhoto, setHasAutoMainPhoto] = useState(false);
  const [uploadNotice, setUploadNotice] = useState('');
  const [source, setSource] = useState('manual');
  const [extracted, setExtracted] = useState(false);
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
      const result = await read(allScreenshots);
      setFields((prev) => ({
        ...prev,
        title: prev.title || result.colorDescription || prev.title,
        color: result.color || prev.color,
        colorDescription: result.colorDescription || prev.colorDescription,
        size: result.size || prev.size,
        ageClass: result.ageClass || prev.ageClass,
        markings: result.markings || prev.markings,
        hasCollar: result.hasCollar ?? prev.hasCollar,
        collarColor: result.collarColor || prev.collarColor,
        collarHasBell: result.collarHasBell ?? prev.collarHasBell,
        hasClippedEar: result.hasClippedEar ?? prev.hasClippedEar,
        city: result.city || prev.city,
        neighborhood: result.neighborhood || prev.neighborhood,
        location: result.location || prev.location,
        dateText: result.dateText || prev.dateText,
        seenDate: result.computedDate || prev.seenDate,
        seenDateApprox: result.computedDateApprox ?? prev.seenDateApprox,
        contactName: result.contactName || prev.contactName,
        contactPhone: result.contactPhone || prev.contactPhone,
        notes: result.captionText || prev.notes,
        sourceGroupName: result.sourceGroupName || prev.sourceGroupName,
        originalPosterName: result.originalPosterName || prev.originalPosterName,
        sharedByName: result.sharedByName || prev.sharedByName,
        postAgeText: result.postAgeText || prev.postAgeText,
      }));
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
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-5 p-4">
      <Link to="/" className="inline-block text-sm text-slate-500 underline">
        ← ביטול וחזרה לעמוד הראשי
      </Link>
      <h1 className="text-xl font-bold text-slate-800">דיווח על חתול שנראה / נמצא</h1>
      <p className="text-sm text-slate-500">
        אם ראית פוסט בפייסבוק על חתול - אין צורך להכיר את מי שכתב אותו. פשוט העלה/י צילום מסך.
      </p>

      <Field label="כותרת (כך יופיע הדיווח ברשימה)">
        <input
          className="input"
          value={fields.title}
          onChange={(e) => setField('title', e.target.value)}
          placeholder='למשל "חתול שחור-לבן ליד הפארק"'
        />
      </Field>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <label className="mb-2 block text-sm font-medium text-slate-600">
          צילום/י מסך של הפוסט (אפשר כמה תמונות, כולל אם הכיתוב נמשך ב"עוד")
        </label>
        <input type="file" accept="image/*" multiple onChange={handleScreenshotUpload} />
        {reading && <AnalyzingIndicator />}
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

      <Field label="מצב החתול">
        <select className="input" value={fields.condition} onChange={(e) => setField('condition', e.target.value)}>
          {CAT_CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="צבע">
        <select className="input" value={fields.color} onChange={(e) => setField('color', e.target.value)}>
          <option value="">בחר/י צבע</option>
          {CAT_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="גודל">
        <select className="input" value={fields.size} onChange={(e) => setField('size', e.target.value)}>
          <option value="">בחר/י</option>
          {CAT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="גור או מבוגר">
        <select className="input" value={fields.ageClass} onChange={(e) => setField('ageClass', e.target.value)}>
          <option value="">בחר/י</option>
          {CAT_AGE_CLASSES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="תיאור נוסף לצבע (תבניות, כתמים וכו')">
        <input
          className="input"
          value={fields.colorDescription}
          onChange={(e) => setField('colorDescription', e.target.value)}
        />
      </Field>

      <Field label="סימנים מיוחדים (סימן אחד בכל שורה)">
        <textarea
          className="input"
          rows={3}
          placeholder={'לדוגמה:\nנקודה שחורה ליד האף\nאוזניים קצרות מהרגיל'}
          value={fields.markings}
          onChange={(e) => setField('markings', e.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={!!fields.hasClippedEar}
          onChange={(e) => setField('hasClippedEar', e.target.checked)}
        />
        אוזן קטומה (סימון סטנדרטי לאחר עיקור/סירוס - נפוץ בחתולי רחוב)
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={!!fields.hasCollar} onChange={(e) => setField('hasCollar', e.target.checked)} />
        לובשת קולר/רתמה
      </label>

      {fields.hasCollar && (
        <>
          <Field label="צבע הקולר">
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
              checked={!!fields.collarHasBell}
              onChange={(e) => setField('collarHasBell', e.target.checked)}
            />
            יש פעמון על הקולר
          </label>
        </>
      )}

      <Field label="עיר">
        <input className="input" value={fields.city} onChange={(e) => setField('city', e.target.value)} />
      </Field>

      <Field label="שכונה">
        <input className="input" value={fields.neighborhood} onChange={(e) => setField('neighborhood', e.target.value)} />
      </Field>

      <Field label="פרטי מיקום נוספים">
        <input className="input" value={fields.location} onChange={(e) => setField('location', e.target.value)} />
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
        {fields.seenDateApprox && (
          <p className="mt-1 text-sm text-amber-700">
            התאריך הוערך אוטומטית מתיאור יחסי (למשל "לפני יום") ולא מתאריך מפורש, ולכן הוא לא מדויק - אפשר לתקן אותו כאן אם ידוע תאריך מדויק יותר.
          </p>
        )}
      </Field>

      <Field label="שם איש קשר (אם קיים בפוסט)">
        <input className="input" value={fields.contactName} onChange={(e) => setField('contactName', e.target.value)} />
      </Field>

      <Field label="טלפון (אם קיים בפוסט)">
        <input className="input" value={fields.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} />
      </Field>

      <Field label="הערות נוספות">
        <textarea className="input" value={fields.notes} onChange={(e) => setField('notes', e.target.value)} />
      </Field>

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

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
