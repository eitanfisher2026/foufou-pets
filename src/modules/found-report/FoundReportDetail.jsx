import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getFoundReport,
  updateFoundReport,
  updateFoundReportStatus,
  removeFoundReportPhoto,
  makeFoundReportPhotoMain,
  deleteFoundReport,
} from './foundReportApi.js';
import {
  RECORD_STATUS,
  FOUND_REPORT_STATUS_LABELS,
  CAT_SIZES,
  CAT_AGE_CLASSES,
  COLLAR_COLORS,
  CAT_CONDITIONS,
} from '../shared/collections.js';
import { formatDate } from '../shared/formatDate.js';
import { useColorOptions } from '../shared/useColorOptions.js';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import ExtractionApproval from '../shared/ExtractionApproval.jsx';
import PhotoLightbox from '../shared/PhotoLightbox.jsx';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { useConfirm } from '../shared/useConfirm.jsx';
import RecordStatusSelect from '../shared/RecordStatusSelect.jsx';
import RecordDetailsDialog from '../shared/RecordDetailsDialog.jsx';

const EXTRACTION_FIELD_DEFS = [
  { targetKey: 'sourceGroupName', extractedKey: 'sourceGroupName', label: 'מקור המידע (קבוצה)' },
  { targetKey: 'originalPosterName', extractedKey: 'originalPosterName', label: 'מי כתב את הפוסט' },
  { targetKey: 'sharedByName', extractedKey: 'sharedByName', label: 'מי שיתף' },
  { targetKey: 'postAgeText', extractedKey: 'postAgeText', label: 'מתי פורסם' },
  { targetKey: 'color', extractedKey: 'color', label: 'צבע' },
  { targetKey: 'colorDescription', extractedKey: 'colorDescription', label: 'תיאור נוסף לצבע' },
  { targetKey: 'markings', extractedKey: 'markings', label: 'סימנים מיוחדים' },
  { targetKey: 'hasClippedEar', extractedKey: 'hasClippedEar', label: 'אוזן קטומה' },
  { targetKey: 'collarColor', extractedKey: 'collarColor', label: 'צבע הקולר' },
  { targetKey: 'collarHasBell', extractedKey: 'collarHasBell', label: 'פעמון על הקולר' },
  { targetKey: 'city', extractedKey: 'city', label: 'עיר' },
  { targetKey: 'neighborhood', extractedKey: 'neighborhood', label: 'שכונה' },
  { targetKey: 'location', extractedKey: 'location', label: 'מיקום' },
  { targetKey: 'dateText', extractedKey: 'dateText', label: 'מועד הראייה/המציאה' },
  { targetKey: 'seenDate', extractedKey: 'computedDate', label: 'תאריך מדויק (מחושב)' },
  { targetKey: 'contactName', extractedKey: 'contactName', label: 'שם איש קשר' },
  { targetKey: 'contactPhone', extractedKey: 'contactPhone', label: 'טלפון' },
  { targetKey: 'notes', extractedKey: 'captionText', label: 'הערות נוספות' },
];

export default function FoundReportDetail() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]);
  const [pendingExtraction, setPendingExtraction] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { reading: extracting, error: extractError, read: extractFromPhotos } = useScreenshotReader();
  const { confirm, dialog } = useConfirm();
  const catColors = useColorOptions();

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

  async function handleRecordStatusChange(status) {
    await updateFoundReportStatus(reportId, status);
    setReport((prev) => ({ ...prev, status }));
  }

  async function handleRemoveExistingPhoto(photo) {
    const remaining = await removeFoundReportPhoto(reportId, photo, report.photos || []);
    setReport((prev) => ({ ...prev, photos: remaining }));
    setFields((prev) => ({ ...prev, photos: remaining }));
  }

  async function handleMakeMainPhoto(photo) {
    const reordered = await makeFoundReportPhotoMain(reportId, photo, report.photos || []);
    setReport((prev) => ({ ...prev, photos: reordered }));
    setFields((prev) => ({ ...prev, photos: reordered }));
  }

  async function handleDelete() {
    const ok = await confirm('למחוק את הדיווח לצמיתות? כל הפרטים והתמונות יימחקו ולא ניתן יהיה לשחזר אותם.', {
      confirmLabel: 'מחיקת הדיווח',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteFoundReport(reportId, report.photos || []);
      navigate('/');
    } finally {
      setDeleting(false);
    }
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
      await updateFoundReport(reportId, fields, newPhotos);
      setNewPhotos([]);
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
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">{report.title || report.colorDescription || 'חתול'}</h1>
              <RecordStatusSelect
                status={report.status || RECORD_STATUS.ACTIVE}
                labels={FOUND_REPORT_STATUS_LABELS}
                onChange={handleRecordStatusChange}
              />
            </div>
            <div className="flex shrink-0 gap-3">
              <button onClick={() => setShowDetails(true)} className="text-sm text-slate-600 underline">
                פרטים מלאים
              </button>
              <button onClick={() => setEditing(true)} className="text-sm text-slate-600 underline">
                עריכה
              </button>
              <button onClick={handleDelete} disabled={deleting} className="text-sm text-red-600 underline disabled:opacity-50">
                {deleting ? 'מוחקים...' : 'מחיקת הדיווח'}
              </button>
            </div>
          </div>
          <p className="mb-2 text-sm text-slate-500">
            {report.color} · {report.location} · {report.dateText}
          </p>
          {report.markings && <p className="mb-2 whitespace-pre-line text-sm text-slate-600">{report.markings}</p>}
          {report.notes && <p className="mb-2 text-sm text-slate-600">{report.notes}</p>}

          <PhotoGallery
            photos={report.photos}
            onView={setLightboxUrl}
            onRemove={handleRemoveExistingPhoto}
            onMakeMain={handleMakeMainPhoto}
            confirm={confirm}
          />

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
            onMakeMainExisting={handleMakeMainPhoto}
            newPhotos={newPhotos}
            onNewPhotosChange={setNewPhotos}
          />
          <Field label="כותרת (כך יופיע הדיווח ברשימה)">
            <input className="input" value={fields.title || ''} onChange={(e) => setField('title', e.target.value)} />
          </Field>
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
          <Field label="מתי פורסם (כפי שכתוב בפוסט)">
            <input className="input" value={fields.postAgeText || ''} onChange={(e) => setField('postAgeText', e.target.value)} />
          </Field>
          <Field label="מצב החתול">
            <select className="input" value={fields.condition || 'seen_only'} onChange={(e) => setField('condition', e.target.value)}>
              {CAT_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="צבע">
            <select className="input" value={fields.color || ''} onChange={(e) => setField('color', e.target.value)}>
              <option value="">בחר/י צבע</option>
              {catColors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="גודל">
            <select className="input" value={fields.size || ''} onChange={(e) => setField('size', e.target.value)}>
              <option value="">בחר/י</option>
              {CAT_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="גור או מבוגר">
            <select className="input" value={fields.ageClass || ''} onChange={(e) => setField('ageClass', e.target.value)}>
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
              value={fields.colorDescription || ''}
              onChange={(e) => setField('colorDescription', e.target.value)}
            />
          </Field>
          <Field label="סימנים מיוחדים (סימן אחד בכל שורה)">
            <textarea
              className="input"
              rows={3}
              value={fields.markings || ''}
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
                <select
                  className="input"
                  value={fields.collarColor || ''}
                  onChange={(e) => setField('collarColor', e.target.value)}
                >
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
            <input className="input" value={fields.city || ''} onChange={(e) => setField('city', e.target.value)} />
          </Field>
          <Field label="שכונה">
            <input
              className="input"
              value={fields.neighborhood || ''}
              onChange={(e) => setField('neighborhood', e.target.value)}
            />
          </Field>
          <Field label="פרטי מיקום נוספים">
            <input className="input" value={fields.location || ''} onChange={(e) => setField('location', e.target.value)} />
          </Field>
          <Field label="מועד הראייה/המציאה (כפי שידוע/נכתב)">
            <input className="input" value={fields.dateText || ''} onChange={(e) => setField('dateText', e.target.value)} />
          </Field>
          <Field label="תאריך מדויק (אם ידוע - משפר את איכות ההתאמות)">
            <input
              type="date"
              className="input"
              value={fields.seenDate || ''}
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
            {extracting && <AnalyzingIndicator />}
            {extractError && <p className="mt-2 text-sm text-red-600">{extractError}</p>}
          </div>

          {pendingExtraction && (
            <ExtractionApproval
              extracted={pendingExtraction}
              fieldDefs={EXTRACTION_FIELD_DEFS}
              currentValues={fields}
              onApply={(updates) => {
                setFields((prev) => ({
                  ...prev,
                  ...updates,
                  ...('seenDate' in updates
                    ? { seenDateApprox: pendingExtraction.computedDateApprox ?? prev.seenDateApprox }
                    : {}),
                }));
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

      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {dialog}
      {showDetails && (
        <RecordDetailsDialog
          title={report.title || report.colorDescription || 'חתול'}
          onClose={() => setShowDetails(false)}
          rows={[
            { label: 'כותרת', value: report.title },
            { label: 'צבע', value: report.color },
            { label: 'גודל', value: CAT_SIZES.find((s) => s.value === report.size)?.label },
            { label: 'גור/מבוגר', value: CAT_AGE_CLASSES.find((a) => a.value === report.ageClass)?.label },
            { label: 'תיאור נוסף לצבע', value: report.colorDescription },
            { label: 'סימנים מיוחדים', value: report.markings },
            { label: 'אוזן קטומה', value: report.hasClippedEar === true ? 'כן' : report.hasClippedEar === false ? 'לא' : '' },
            { label: 'קולר/רתמה', value: report.hasCollar === true ? 'כן' : report.hasCollar === false ? 'לא' : '' },
            { label: 'צבע הקולר', value: report.collarColor },
            { label: 'פעמון על הקולר', value: report.collarHasBell === true ? 'כן' : report.collarHasBell === false ? 'לא' : '' },
            { label: 'עיר', value: report.city },
            { label: 'שכונה', value: report.neighborhood },
            { label: 'מצב החתול', value: CAT_CONDITIONS.find((c) => c.value === report.condition)?.label },
            { label: 'מיקום', value: report.location },
            { label: 'מועד הראייה/המציאה', value: report.dateText },
            {
              label: 'תאריך מדויק',
              value: report.seenDate ? `${formatDate(report.seenDate)}${report.seenDateApprox ? ' (משוער)' : ''}` : '',
            },
            { label: 'מקור המידע (קבוצה)', value: report.sourceGroupName },
            { label: 'מי כתב את הפוסט', value: report.originalPosterName },
            { label: 'מי שיתף', value: report.sharedByName },
            { label: 'מתי פורסם', value: report.postAgeText },
            { label: 'שם איש קשר', value: report.contactName },
            { label: 'טלפון', value: report.contactPhone },
            { label: 'הערות נוספות', value: report.notes },
          ]}
        />
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

function PhotoGallery({ photos, onView, onRemove, onMakeMain, confirm }) {
  if (!photos || photos.length === 0) return null;

  async function handleRemove(photo) {
    if (await confirm('להסיר את התמונה?')) onRemove(photo);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      {photos.map((p, i) => (
        <div key={i} className="relative">
          <button type="button" onClick={() => onView(p.url)}>
            <img
              src={p.url}
              alt=""
              className={`h-56 w-auto max-w-full rounded-lg object-contain bg-slate-50 ${
                i === 0 ? 'ring-4 ring-amber-400' : 'border border-slate-200'
              }`}
            />
          </button>
          {i === 0 ? (
            <span className="absolute bottom-1 left-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
              תמונה ראשית
            </span>
          ) : (
            onMakeMain && (
              <button
                type="button"
                onClick={() => onMakeMain(p)}
                className="absolute bottom-1 left-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-medium text-white"
              >
                הפוך לראשית
              </button>
            )
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => handleRemove(p)}
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow"
              aria-label="הסרת תמונה"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
