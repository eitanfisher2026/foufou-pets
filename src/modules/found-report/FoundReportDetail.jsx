import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  CAT_FUR_TYPES,
  COLLAR_COLORS,
  CAT_CONDITIONS,
} from '../shared/collections.js';
import { useColorOptions } from '../shared/useColorOptions.js';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import FormSection from '../shared/FormSection.jsx';
import BackLink from '../shared/BackLink.jsx';
import Field from '../shared/Field.jsx';
import ExtractionApproval from '../shared/ExtractionApproval.jsx';
import PhotoLightbox from '../shared/PhotoLightbox.jsx';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { useConfirm } from '../shared/useConfirm.jsx';
import RecordStatusSelect from '../shared/RecordStatusSelect.jsx';
import RecordDetailsDialog from '../shared/RecordDetailsDialog.jsx';
import { buildFoundReportSections } from './foundReportSections.js';

const EXTRACTION_FIELD_DEFS = [
  { targetKey: 'sourceGroupName', extractedKey: 'sourceGroupName', label: 'מקור המידע (קבוצה)' },
  { targetKey: 'originalPosterName', extractedKey: 'originalPosterName', label: 'מי כתב את הפוסט' },
  { targetKey: 'sharedByName', extractedKey: 'sharedByName', label: 'מי שיתף' },
  { targetKey: 'postAgeText', extractedKey: 'postAgeText', label: 'מתי פורסם' },
  { targetKey: 'color', extractedKey: 'color', label: 'צבע' },
  { targetKey: 'breed', extractedKey: 'breed', label: 'גזע' },
  { targetKey: 'markings', extractedKey: 'markings', label: 'סימנים מיוחדים' },
  { targetKey: 'hasClippedEar', extractedKey: 'hasClippedEar', label: 'אוזן קטומה' },
  { targetKey: 'collarColor', extractedKey: 'collarColor', label: 'צבע הקולר' },
  { targetKey: 'collarHasBell', extractedKey: 'collarHasBell', label: 'פעמון על הקולר' },
  { targetKey: 'city', extractedKey: 'city', label: 'עיר' },
  { targetKey: 'neighborhood', extractedKey: 'neighborhood', label: 'שכונה' },
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
  const [newPhotosFirst, setNewPhotosFirst] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const {
    reading: extracting,
    error: extractError,
    read: extractFromPhotos,
    cancel: cancelExtracting,
  } = useScreenshotReader();
  const { confirm, dialog } = useConfirm();
  const catColors = useColorOptions();

  useEffect(() => {
    load();
  }, [reportId]);

  // Editing this form means scrolling past a lot of fields to reach Save -
  // losing that on an accidental tab close/refresh is a real, already-
  // reported way to lose real edits (e.g. after fixing a bad main photo).
  useEffect(() => {
    if (!editing) return;
    function handleBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editing]);

  async function handleBackToHome() {
    if (editing && !(await confirm('יש שינויים שלא נשמרו. לצאת בכל זאת?', { confirmLabel: 'לצאת בלי לשמור', danger: true }))) {
      return;
    }
    navigate('/');
  }

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
      // The AI call already happened and was billed - track its cost
      // regardless of whether the suggested fields end up applied.
      setFields((prev) => ({
        ...prev,
        aiCostUsd: (prev.aiCostUsd || 0) + (result._aiUsage?.estimatedCostUsd || 0),
      }));
    } catch {
      // error already surfaced via extractError
    }
    e.target.value = '';
  }

  async function handleSave() {
    setSaving(true);
    try {
      const existingCountBeforeSave = (fields.photos || []).length;
      await updateFoundReport(reportId, fields, newPhotos);
      if (newPhotosFirst && newPhotos.length > 0) {
        const fresh = await getFoundReport(reportId);
        const promoted = fresh.photos?.[existingCountBeforeSave];
        if (promoted) await makeFoundReportPhotoMain(reportId, promoted, fresh.photos);
      }
      setNewPhotos([]);
      setNewPhotosFirst(false);
      setPendingExtraction(null);
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!report) return <p className="p-4 text-slate-500">טוען...</p>;

  return (
    <div className="p-4">
      <BackLink onClick={handleBackToHome}>חזרה לעמוד הראשי</BackLink>

      {!editing ? (
        <>
          <MainPhoto photo={report.photos?.[0]} onView={setLightboxUrl} />
          <div className="mb-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-xl font-bold text-slate-800">
                {report.title || 'חתול'}
              </h1>
              <RecordStatusSelect
                status={report.status || RECORD_STATUS.ACTIVE}
                labels={FOUND_REPORT_STATUS_LABELS}
                onChange={handleRecordStatusChange}
              />
            </div>
            <p className="mb-2 text-sm text-slate-500">
              {report.color} · {report.neighborhood} · {report.dateText}
            </p>
            <div className="flex flex-wrap gap-3">
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
          {report.markings && <p className="mb-2 whitespace-pre-line text-sm text-slate-600">{report.markings}</p>}
          {report.notes && <p className="mb-2 text-sm text-slate-600">{report.notes}</p>}

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
            newPhotosFirst={newPhotosFirst}
            onNewPhotosFirstChange={setNewPhotosFirst}
          />
          <FormSection title="פרטי חתול">
            <Field label="שם החתולה (אם ידוע) / כותרת (כך יופיע הדיווח ברשימה)">
              <input className="input" value={fields.title || ''} onChange={(e) => setField('title', e.target.value)} />
            </Field>
            <Field label="מצב החתול" inline>
              <select
                className="input w-36"
                value={fields.condition || 'seen_only'}
                onChange={(e) => setField('condition', e.target.value)}
              >
                {CAT_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="צבע" inline>
              <select className="input w-36" value={fields.color || ''} onChange={(e) => setField('color', e.target.value)}>
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
                  <select
                    className="input w-36"
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
                value={fields.markings || ''}
                onChange={(e) => setField('markings', e.target.value)}
              />
            </Field>
            <Field label="גזע" inline>
              <input
                className="input w-36"
                value={fields.breed || ''}
                onChange={(e) => setField('breed', e.target.value)}
                placeholder="אם ידוע"
              />
            </Field>
            <Field label="סוג פרווה" inline>
              <select className="input w-36" value={fields.furType || ''} onChange={(e) => setField('furType', e.target.value)}>
                <option value="">בחר/י</option>
                {CAT_FUR_TYPES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="גודל" inline>
              <select className="input w-36" value={fields.size || ''} onChange={(e) => setField('size', e.target.value)}>
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
              <input className="input" value={fields.city || ''} onChange={(e) => setField('city', e.target.value)} />
            </Field>
            <Field label="שכונה (אפשר גם פרטי מיקום נוספים, כמו רחוב או ציון דרך)">
              <input
                className="input"
                value={fields.neighborhood || ''}
                onChange={(e) => setField('neighborhood', e.target.value)}
              />
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
          </FormSection>

          <FormSection title="פרטי קשר">
            <Field label="שם איש קשר">
              <input className="input" value={fields.contactName || ''} onChange={(e) => setField('contactName', e.target.value)} />
            </Field>
            <Field label="טלפון">
              <input className="input" value={fields.contactPhone || ''} onChange={(e) => setField('contactPhone', e.target.value)} />
            </Field>
            <Field label="הערות נוספות">
              <textarea className="input" value={fields.notes || ''} onChange={(e) => setField('notes', e.target.value)} />
            </Field>
          </FormSection>

          <FormSection title="מקור מידע">
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
              <input
                className="input"
                value={fields.postAgeText || ''}
                onChange={(e) => setField('postAgeText', e.target.value)}
              />
            </Field>
          </FormSection>

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <label className="mb-2 block text-sm font-medium text-slate-600">
              יש צילום מסך נוסף? אפשר להעלות ולעדכן פרטים אוטומטית מתוכו.
            </label>
            <input type="file" accept="image/*" multiple onChange={handleExtractionUpload} />
            {extracting && <AnalyzingIndicator onCancel={cancelExtracting} />}
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

          <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-slate-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
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
                setNewPhotosFirst(false);
                setPendingExtraction(null);
                setEditing(false);
              }}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-600"
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
          title={report.title || 'חתול'}
          onClose={() => setShowDetails(false)}
          photos={report.photos}
          onViewPhoto={setLightboxUrl}
          sections={buildFoundReportSections(report)}
        />
      )}
    </div>
  );
}

// View mode shows only the main photo - the rest (extra angles, raw
// screenshots) are still there, just tucked behind "עריכה" and "פרטים
// מלאים" instead of stretching the summary view. Width always fills its
// container (never wider), so a wide/landscape source image can't overflow
// the page the way a fixed-height/auto-width image could.
function MainPhoto({ photo, onView }) {
  if (!photo) return null;
  return (
    <button type="button" onClick={() => onView(photo.url)} className="mb-4 block w-full">
      <img
        src={photo.url}
        alt=""
        className="h-64 w-full rounded-lg bg-slate-50 object-contain ring-4 ring-amber-400 sm:h-80"
      />
    </button>
  );
}
