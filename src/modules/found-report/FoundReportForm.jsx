import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { extractMainPhoto } from '../shared/cropPhoto.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import { createFoundReport } from './foundReportApi.js';

const EMPTY_FIELDS = {
  colorDescription: '',
  markings: '',
  hasCollar: null,
  location: '',
  dateText: '',
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

  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [photos, setPhotos] = useState([]);
  const [source, setSource] = useState('manual');
  const [extracted, setExtracted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleScreenshotUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setPhotos((prev) => [...prev, ...files]);
    setSource('screenshot');
    try {
      const result = await read(files);
      setFields((prev) => ({
        ...prev,
        colorDescription: result.colorDescription || prev.colorDescription,
        markings: result.markings || prev.markings,
        hasCollar: result.hasCollar ?? prev.hasCollar,
        location: result.location || prev.location,
        dateText: result.dateText || prev.dateText,
        contactName: result.contactName || prev.contactName,
        contactPhone: result.contactPhone || prev.contactPhone,
        notes: result.captionText || prev.notes,
        sourceGroupName: result.sourceGroupName || prev.sourceGroupName,
        originalPosterName: result.originalPosterName || prev.originalPosterName,
        sharedByName: result.sharedByName || prev.sharedByName,
        postAgeText: result.postAgeText || prev.postAgeText,
      }));
      setExtracted(true);

      const mainPhoto = await extractMainPhoto(files, result.mainPhotoRegion);
      if (mainPhoto) setPhotos((prev) => [mainPhoto, ...prev]);
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

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <label className="mb-2 block text-sm font-medium text-slate-600">
          צילום/י מסך של הפוסט (אפשר כמה תמונות, כולל אם הכיתוב נמשך ב"עוד")
        </label>
        <input type="file" accept="image/*" multiple onChange={handleScreenshotUpload} />
        {reading && <AnalyzingIndicator />}
        {readError && <p className="mt-2 text-sm text-red-600">{readError}</p>}
      </div>

      <EditablePhotoGrid existingPhotos={[]} newPhotos={photos} onNewPhotosChange={setPhotos} />

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
          <option value="seen_only">נראה בלבד (לא נתפס)</option>
          <option value="held_by_finder">נמצא ונשאר בידי המדווח</option>
          <option value="at_vet">הועבר למרפאה</option>
        </select>
      </Field>

      <Field label="צבע ותיאור">
        <input
          className="input"
          value={fields.colorDescription}
          onChange={(e) => setField('colorDescription', e.target.value)}
        />
      </Field>

      <Field label="סימנים מזהים">
        <textarea className="input" value={fields.markings} onChange={(e) => setField('markings', e.target.value)} />
      </Field>

      <Field label="מיקום">
        <input className="input" value={fields.location} onChange={(e) => setField('location', e.target.value)} />
      </Field>

      <Field label="מועד הראייה/המציאה">
        <input className="input" value={fields.dateText} onChange={(e) => setField('dateText', e.target.value)} />
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
