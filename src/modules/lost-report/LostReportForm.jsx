import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { extractMainPhoto } from '../shared/cropPhoto.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import { useConfirm } from '../shared/useConfirm.jsx';
import { useColorOptions } from '../shared/useColorOptions.js';
import { CAT_SIZES, CAT_AGE_CLASSES, COLLAR_COLORS } from '../shared/collections.js';
import { createLostCase } from './lostReportApi.js';

const EMPTY_FIELDS = {
  name: '',
  color: '',
  size: '',
  ageClass: '',
  markings: '',
  hasCollar: false,
  collarColor: '',
  collarHasBell: false,
  hasClippedEar: false,
  city: '',
  neighborhood: '',
  lastSeenLocation: '',
  lastSeenAt: '',
  lastSeenDate: '',
  lastSeenDateApprox: false,
  contactName: '',
  contactPhone: '',
  notes: '',
};

export default function LostReportForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read } = useScreenshotReader();
  const { confirm, dialog } = useConfirm();
  const catColors = useColorOptions();

  const [fields, setFields] = useState(EMPTY_FIELDS);
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
      setFields((prev) => ({
        ...prev,
        name: extracted.petName || prev.name,
        color: extracted.color || prev.color,
        size: extracted.size || prev.size,
        ageClass: extracted.ageClass || prev.ageClass,
        markings: extracted.markings || prev.markings,
        hasCollar: extracted.hasCollar ?? prev.hasCollar,
        collarColor: extracted.collarColor || prev.collarColor,
        collarHasBell: extracted.collarHasBell ?? prev.collarHasBell,
        hasClippedEar: extracted.hasClippedEar ?? prev.hasClippedEar,
        city: extracted.city || prev.city,
        neighborhood: extracted.neighborhood || prev.neighborhood,
        lastSeenLocation: extracted.location || prev.lastSeenLocation,
        lastSeenAt: extracted.dateText || prev.lastSeenAt,
        lastSeenDate: extracted.computedDate || prev.lastSeenDate,
        lastSeenDateApprox: extracted.computedDateApprox ?? prev.lastSeenDateApprox,
        contactName: extracted.contactName || prev.contactName,
        contactPhone: extracted.contactPhone || prev.contactPhone,
        notes: extracted.captionText || prev.notes,
      }));

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
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-5 p-4">
      <Link to="/" className="inline-block text-sm text-slate-500 underline">
        ← ביטול וחזרה לעמוד הראשי
      </Link>
      <h1 className="text-xl font-bold text-slate-800">פתיחת תיק חיפוש - חתול אבד</h1>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <label className="mb-2 block text-sm font-medium text-slate-600">
          יש לך צילום מסך של פוסט מפייסבוק על החתולה? אפשר להעלות אותו וחלק מהשדות יתמלאו אוטומטית.
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
            label="תמונות שיתווספו לתיק"
            addLabel="יש לך גם תמונה רגילה (לא צילום מסך)? אפשר להוסיף אותה כאן"
          />
        </div>
      </div>

      <Field label="שם החתולה">
        <input className="input" value={fields.name} onChange={(e) => setField('name', e.target.value)} />
      </Field>

      <Field label="צבע">
        <select className="input" value={fields.color} onChange={(e) => setField('color', e.target.value)}>
          <option value="">בחר/י צבע</option>
          {catColors.map((c) => (
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
          checked={fields.hasClippedEar}
          onChange={(e) => setField('hasClippedEar', e.target.checked)}
        />
        אוזן קטומה (סימון סטנדרטי לאחר עיקור/סירוס - נפוץ בחתולי רחוב)
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={fields.hasCollar} onChange={(e) => setField('hasCollar', e.target.checked)} />
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
              checked={fields.collarHasBell}
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

      <Field label="פרטי מיקום נוספים (רחוב, ציון דרך)">
        <input
          className="input"
          value={fields.lastSeenLocation}
          onChange={(e) => setField('lastSeenLocation', e.target.value)}
        />
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

      <Field label="שם איש קשר">
        <input className="input" value={fields.contactName} onChange={(e) => setField('contactName', e.target.value)} />
      </Field>

      <Field label="טלפון">
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
        {submitting ? 'פותחים תיק...' : 'פתיחת תיק חיפוש'}
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
