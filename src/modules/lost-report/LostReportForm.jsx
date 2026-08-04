import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { CAT_COLORS } from '../shared/collections.js';
import { createLostCase } from './lostReportApi.js';

const EMPTY_FIELDS = {
  name: '',
  color: '',
  size: '',
  markings: '',
  hasCollar: false,
  lastSeenLocation: '',
  lastSeenAt: '',
  contactName: '',
  contactPhone: '',
  notes: '',
};

export default function LostReportForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read } = useScreenshotReader();

  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [photos, setPhotos] = useState([]);
  const [source, setSource] = useState('manual');
  const [submitting, setSubmitting] = useState(false);

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleScreenshotUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setPhotos(files);
    setSource('screenshot');
    try {
      const extracted = await read(files);
      setFields((prev) => ({
        ...prev,
        name: extracted.petName || prev.name,
        color: extracted.colorDescription || prev.color,
        markings: extracted.markings || prev.markings,
        hasCollar: extracted.hasCollar ?? prev.hasCollar,
        lastSeenLocation: extracted.location || prev.lastSeenLocation,
        lastSeenAt: extracted.dateText || prev.lastSeenAt,
        contactName: extracted.contactName || prev.contactName,
        contactPhone: extracted.contactPhone || prev.contactPhone,
        notes: extracted.captionText || prev.notes,
      }));
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
      </div>

      <Field label="שם החתולה">
        <input className="input" value={fields.name} onChange={(e) => setField('name', e.target.value)} />
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
          <option value="small">קטן/גור</option>
          <option value="medium">בינוני</option>
          <option value="large">גדול</option>
        </select>
      </Field>

      <Field label="סימנים מזהים">
        <textarea className="input" value={fields.markings} onChange={(e) => setField('markings', e.target.value)} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={fields.hasCollar} onChange={(e) => setField('hasCollar', e.target.checked)} />
        לובשת קולר/רתמה
      </label>

      <Field label="מקום אחרון שנראתה">
        <input
          className="input"
          value={fields.lastSeenLocation}
          onChange={(e) => setField('lastSeenLocation', e.target.value)}
        />
      </Field>

      <Field label="מועד האובדן">
        <input className="input" value={fields.lastSeenAt} onChange={(e) => setField('lastSeenAt', e.target.value)} />
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

      {source === 'manual' && (
        <Field label="תמונות">
          <input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []))} />
        </Field>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'פותחים תיק...' : 'פתיחת תיק חיפוש'}
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
