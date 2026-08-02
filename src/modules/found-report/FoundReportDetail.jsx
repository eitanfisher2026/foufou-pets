import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getFoundReport, updateFoundReport } from './foundReportApi.js';

export default function FoundReportDetail() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [reportId]);

  async function load() {
    const data = await getFoundReport(reportId);
    setReport(data);
    setFields(data);
  }

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateFoundReport(reportId, fields, newPhotos);
      setNewPhotos([]);
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!report) return <p className="p-4 text-slate-500">טוען...</p>;

  return (
    <div className="mx-auto max-w-lg p-4">
      <Link to="/" className="mb-4 inline-block text-sm text-slate-500 underline">
        ← חזרה לעמוד הראשי
      </Link>

      {!editing ? (
        <>
          <div className="mb-4 flex items-start justify-between">
            <h1 className="text-xl font-bold text-slate-800">{report.colorDescription || 'חתול'}</h1>
            <button onClick={() => setEditing(true)} className="text-sm text-slate-600 underline">
              עריכה
            </button>
          </div>
          <p className="mb-2 text-sm text-slate-500">
            {report.location} · {report.dateText}
          </p>
          {report.markings && <p className="mb-2 text-sm text-slate-600">{report.markings}</p>}
          {report.notes && <p className="mb-2 text-sm text-slate-600">{report.notes}</p>}

          {report.photos?.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {report.photos.map((p, i) => (
                <img key={i} src={p.url} alt="" className="h-28 w-28 flex-shrink-0 rounded-lg object-cover" />
              ))}
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            {report.sourceGroupName && <p>מקור: {report.sourceGroupName}</p>}
            {report.originalPosterName && <p>פורסם ע"י: {report.originalPosterName}</p>}
            {report.sharedByName && <p>שותף ע"י: {report.sharedByName}</p>}
            {report.contactName && <p>איש קשר: {report.contactName}</p>}
            {report.contactPhone && <p>טלפון: {report.contactPhone}</p>}
          </div>
        </>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <Field label="מקור המידע (שם הקבוצה)">
            <input
              className="input"
              value={fields.sourceGroupName || ''}
              onChange={(e) => setField('sourceGroupName', e.target.value)}
            />
          </Field>
          <Field label="מי כתב את הפוסט המקורי">
            <input
              className="input"
              value={fields.originalPosterName || ''}
              onChange={(e) => setField('originalPosterName', e.target.value)}
            />
          </Field>
          <Field label="מי שיתף את הפוסט">
            <input
              className="input"
              value={fields.sharedByName || ''}
              onChange={(e) => setField('sharedByName', e.target.value)}
            />
          </Field>
          <Field label="צבע ותיאור">
            <input
              className="input"
              value={fields.colorDescription || ''}
              onChange={(e) => setField('colorDescription', e.target.value)}
            />
          </Field>
          <Field label="סימנים מזהים">
            <textarea className="input" value={fields.markings || ''} onChange={(e) => setField('markings', e.target.value)} />
          </Field>
          <Field label="מיקום">
            <input className="input" value={fields.location || ''} onChange={(e) => setField('location', e.target.value)} />
          </Field>
          <Field label="מועד הראייה/המציאה">
            <input className="input" value={fields.dateText || ''} onChange={(e) => setField('dateText', e.target.value)} />
          </Field>
          <Field label="שם איש קשר">
            <input className="input" value={fields.contactName || ''} onChange={(e) => setField('contactName', e.target.value)} />
          </Field>
          <Field label="טלפון">
            <input className="input" value={fields.contactPhone || ''} onChange={(e) => setField('contactPhone', e.target.value)} />
          </Field>
          <Field label="הערות נוספות">
            <textarea className="input" value={fields.notes || ''} onChange={(e) => setField('notes', e.target.value)} />
          </Field>
          <Field label="הוספת תמונות">
            <input type="file" accept="image/*" multiple onChange={(e) => setNewPhotos(Array.from(e.target.files || []))} />
          </Field>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {saving ? 'שומרים...' : 'שמירה'}
            </button>
            <button
              onClick={() => {
                setFields(report);
                setNewPhotos([]);
                setEditing(false);
              }}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-600"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
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
