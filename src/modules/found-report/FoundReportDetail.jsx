import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getFoundReport, updateFoundReport } from './foundReportApi.js';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import ExtractionApproval from '../shared/ExtractionApproval.jsx';

const EXTRACTION_FIELD_DEFS = [
  { targetKey: 'sourceGroupName', extractedKey: 'sourceGroupName', label: 'מקור המידע (קבוצה)' },
  { targetKey: 'originalPosterName', extractedKey: 'originalPosterName', label: 'מי כתב את הפוסט' },
  { targetKey: 'sharedByName', extractedKey: 'sharedByName', label: 'מי שיתף' },
  { targetKey: 'postAgeText', extractedKey: 'postAgeText', label: 'מתי פורסם' },
  { targetKey: 'colorDescription', extractedKey: 'colorDescription', label: 'צבע ותיאור' },
  { targetKey: 'markings', extractedKey: 'markings', label: 'סימנים מזהים' },
  { targetKey: 'location', extractedKey: 'location', label: 'מיקום' },
  { targetKey: 'dateText', extractedKey: 'dateText', label: 'מועד הראייה/המציאה' },
  { targetKey: 'contactName', extractedKey: 'contactName', label: 'שם איש קשר' },
  { targetKey: 'contactPhone', extractedKey: 'contactPhone', label: 'טלפון' },
  { targetKey: 'notes', extractedKey: 'captionText', label: 'הערות נוספות' },
];

export default function FoundReportDetail() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]);
  const [removedPhotoPaths, setRemovedPhotoPaths] = useState([]);
  const [pendingExtraction, setPendingExtraction] = useState(null);
  const [saving, setSaving] = useState(false);
  const { reading: extracting, error: extractError, read: extractFromPhotos } = useScreenshotReader();

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

  function handleRemoveExistingPhoto(photo) {
    setFields((prev) => ({ ...prev, photos: (prev.photos || []).filter((p) => p.path !== photo.path) }));
    setRemovedPhotoPaths((prev) => [...prev, photo.path]);
  }

  async function handleExtractionUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setNewPhotos((prev) => [...prev, ...files]);
    try {
      const result = await extractFromPhotos(files);
      setPendingExtraction(result);
    } catch {
      // error already surfaced via extractError
    }
    e.target.value = '';
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateFoundReport(reportId, fields, {
        newPhotoFiles: newPhotos,
        removedPhotoPaths,
        existingPhotos: report.photos || [],
      });
      setNewPhotos([]);
      setRemovedPhotoPaths([]);
      setPendingExtraction(null);
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

          <PhotoGallery photos={report.photos} />

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
          <EditablePhotoGrid
            existingPhotos={fields.photos || []}
            onRemoveExisting={handleRemoveExistingPhoto}
            newPhotos={newPhotos}
            onNewPhotosChange={setNewPhotos}
          />
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

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <label className="mb-2 block text-sm font-medium text-slate-600">
              יש צילום מסך נוסף? אפשר להעלות ולעדכן פרטים אוטומטית מתוכו.
            </label>
            <input type="file" accept="image/*" multiple onChange={handleExtractionUpload} />
            {extracting && <p className="mt-2 text-sm text-slate-500">קוראים את התמונה...</p>}
            {extractError && <p className="mt-2 text-sm text-red-600">{extractError}</p>}
          </div>

          {pendingExtraction && (
            <ExtractionApproval
              extracted={pendingExtraction}
              fieldDefs={EXTRACTION_FIELD_DEFS}
              currentValues={fields}
              onApply={(updates) => {
                setFields((prev) => ({ ...prev, ...updates }));
                setPendingExtraction(null);
              }}
              onDiscard={() => setPendingExtraction(null)}
            />
          )}

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
                setRemovedPhotoPaths([]);
                setPendingExtraction(null);
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

function PhotoGallery({ photos }) {
  if (!photos || photos.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      {photos.map((p, i) => (
        <a key={i} href={p.url} target="_blank" rel="noreferrer">
          <img
            src={p.url}
            alt=""
            className="h-56 w-auto max-w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
          />
        </a>
      ))}
    </div>
  );
}
