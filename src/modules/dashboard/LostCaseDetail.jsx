import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import {
  COLLECTIONS,
  REPORT_STATUS,
  RECORD_STATUS,
  LOST_CASE_STATUS_LABELS,
  CAT_COLORS,
  CAT_SIZES,
  CAT_AGE_CLASSES,
  COLLAR_COLORS,
} from '../shared/collections.js';
import {
  getLostCase,
  updateLostCase,
  updateLostCaseStatus,
  removeLostCasePhoto,
  makeLostCasePhotoMain,
  deleteLostCase,
} from '../lost-report/lostReportApi.js';
import { checkMatchesForLostCase, getMatches, updateMatchStatus } from '../matching/matchingApi.js';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import ExtractionApproval from '../shared/ExtractionApproval.jsx';
import PhotoLightbox from '../shared/PhotoLightbox.jsx';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { useConfirm } from '../shared/useConfirm.jsx';
import RecordStatusSelect from '../shared/RecordStatusSelect.jsx';
import RecordDetailsDialog from '../shared/RecordDetailsDialog.jsx';

const EXTRACTION_FIELD_DEFS = [
  { targetKey: 'name', extractedKey: 'petName', label: 'שם החתולה' },
  { targetKey: 'color', extractedKey: 'color', label: 'צבע' },
  { targetKey: 'markings', extractedKey: 'markings', label: 'סימנים מיוחדים' },
  { targetKey: 'hasClippedEar', extractedKey: 'hasClippedEar', label: 'אוזן קטומה' },
  { targetKey: 'hasCollar', extractedKey: 'hasCollar', label: 'קולר/רתמה' },
  { targetKey: 'collarColor', extractedKey: 'collarColor', label: 'צבע הקולר' },
  { targetKey: 'collarHasBell', extractedKey: 'collarHasBell', label: 'פעמון על הקולר' },
  { targetKey: 'city', extractedKey: 'city', label: 'עיר' },
  { targetKey: 'neighborhood', extractedKey: 'neighborhood', label: 'שכונה' },
  { targetKey: 'lastSeenLocation', extractedKey: 'location', label: 'מקום אחרון שנראתה' },
  { targetKey: 'lastSeenAt', extractedKey: 'dateText', label: 'מועד האובדן' },
  { targetKey: 'lastSeenDate', extractedKey: 'computedDate', label: 'תאריך מדויק (מחושב)' },
  { targetKey: 'contactName', extractedKey: 'contactName', label: 'שם איש קשר' },
  { targetKey: 'contactPhone', extractedKey: 'contactPhone', label: 'טלפון' },
  { targetKey: 'notes', extractedKey: 'captionText', label: 'הערות נוספות' },
];

const MATCH_STATUS_LABELS = {
  [REPORT_STATUS.NEW]: 'חדש',
  [REPORT_STATUS.REVIEWING]: 'בבדיקה',
  [REPORT_STATUS.NEEDS_FOLLOWUP]: 'דורש מעקב',
  [REPORT_STATUS.NOT_RELEVANT]: 'נבדק ולא נמצא קשר',
  [REPORT_STATUS.LIKELY_MATCH]: 'בעל סבירות גבוהה',
  [REPORT_STATUS.CONTACTED]: 'נוצר קשר עם המדווח',
  [REPORT_STATUS.CLOSED]: 'נסגר',
};

export default function LostCaseDetail() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [lostCase, setLostCase] = useState(null);
  const [matches, setMatches] = useState([]);
  const [reportsById, setReportsById] = useState({});
  const [checking, setChecking] = useState(false);
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

  useEffect(() => {
    load();
  }, [caseId]);

  async function load() {
    const data = await getLostCase(caseId);
    setLostCase(data);
    setFields(data);
    const existingMatches = await getMatches(caseId);
    setMatches(existingMatches);
    await loadReportSnapshots(existingMatches);
  }

  async function loadReportSnapshots(matchList) {
    const snapshots = {};
    await Promise.all(
      matchList.map(async (m) => {
        const snap = await getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, m.foundReportId));
        if (snap.exists()) snapshots[m.foundReportId] = { id: snap.id, ...snap.data() };
      })
    );
    setReportsById(snapshots);
  }

  async function handleCheckMatches() {
    setChecking(true);
    try {
      await checkMatchesForLostCase(caseId);
      await load();
    } finally {
      setChecking(false);
    }
  }

  async function handleStatusChange(foundReportId, status) {
    await updateMatchStatus(caseId, foundReportId, status);
    setMatches((prev) => prev.map((m) => (m.foundReportId === foundReportId ? { ...m, status } : m)));
  }

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleRecordStatusChange(status) {
    await updateLostCaseStatus(caseId, status);
    setLostCase((prev) => ({ ...prev, status }));
  }

  async function handleRemoveExistingPhoto(photo) {
    const remaining = await removeLostCasePhoto(caseId, photo, lostCase.photos || []);
    setLostCase((prev) => ({ ...prev, photos: remaining }));
    setFields((prev) => ({ ...prev, photos: remaining }));
  }

  async function handleMakeMainPhoto(photo) {
    const reordered = await makeLostCasePhotoMain(caseId, photo, lostCase.photos || []);
    setLostCase((prev) => ({ ...prev, photos: reordered }));
    setFields((prev) => ({ ...prev, photos: reordered }));
  }

  async function handleDelete() {
    const ok = await confirm('למחוק את תיק החיפוש לצמיתות? כל הפרטים, התמונות וההתאמות יימחקו ולא ניתן יהיה לשחזר אותם.', {
      confirmLabel: 'מחיקת התיק',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteLostCase(caseId, lostCase.photos || []);
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
      await updateLostCase(caseId, fields, newPhotos);
      setNewPhotos([]);
      setPendingExtraction(null);
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!lostCase) return <p className="p-4 text-slate-500">טוען...</p>;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Link to="/" className="mb-4 inline-block text-sm text-slate-500 underline">
        ← חזרה לעמוד הראשי
      </Link>

      {!editing ? (
        <>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-800">{lostCase.name || 'חתול ללא שם'}</h1>
                <RecordStatusSelect
                  status={lostCase.status || RECORD_STATUS.ACTIVE}
                  labels={LOST_CASE_STATUS_LABELS}
                  onChange={handleRecordStatusChange}
                />
              </div>
              <p className="text-sm text-slate-500">
                {lostCase.color} · {lostCase.lastSeenLocation} · {lostCase.lastSeenAt}
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <button onClick={() => setShowDetails(true)} className="text-sm text-slate-600 underline">
                פרטים מלאים
              </button>
              <button onClick={() => setEditing(true)} className="text-sm text-slate-600 underline">
                עריכה
              </button>
              <button onClick={handleDelete} disabled={deleting} className="text-sm text-red-600 underline disabled:opacity-50">
                {deleting ? 'מוחקים...' : 'מחיקת התיק'}
              </button>
            </div>
          </div>
          <PhotoGallery
            photos={lostCase.photos}
            onView={setLightboxUrl}
            onRemove={handleRemoveExistingPhoto}
            onMakeMain={handleMakeMainPhoto}
            confirm={confirm}
          />
          {lostCase.markings && <p className="mb-2 whitespace-pre-line text-sm text-slate-600">{lostCase.markings}</p>}
          {lostCase.contactPhone && (
            <p className="mb-2 text-sm text-slate-600">טלפון: {lostCase.contactPhone}</p>
          )}
        </>
      ) : (
        <div className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <EditablePhotoGrid
            existingPhotos={fields.photos || []}
            onRemoveExisting={handleRemoveExistingPhoto}
            onMakeMainExisting={handleMakeMainPhoto}
            newPhotos={newPhotos}
            onNewPhotosChange={setNewPhotos}
          />
          <Field label="שם החתולה">
            <input className="input" value={fields.name || ''} onChange={(e) => setField('name', e.target.value)} />
          </Field>
          <Field label="צבע">
            <select className="input" value={fields.color || ''} onChange={(e) => setField('color', e.target.value)}>
              <option value="">בחר/י צבע</option>
              {CAT_COLORS.map((c) => (
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
            <input
              type="checkbox"
              checked={!!fields.hasCollar}
              onChange={(e) => setField('hasCollar', e.target.checked)}
            />
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
            <input
              className="input"
              value={fields.lastSeenLocation || ''}
              onChange={(e) => setField('lastSeenLocation', e.target.value)}
            />
          </Field>
          <Field label="מועד האובדן (כפי שידוע/נכתב)">
            <input className="input" value={fields.lastSeenAt || ''} onChange={(e) => setField('lastSeenAt', e.target.value)} />
          </Field>
          <Field label="תאריך מדויק (אם ידוע - משפר את איכות ההתאמות)">
            <input
              type="date"
              className="input"
              value={fields.lastSeenDate || ''}
              onChange={(e) => setField('lastSeenDate', e.target.value)}
            />
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
                setFields(lostCase);
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

      <button
        onClick={handleCheckMatches}
        disabled={checking}
        className="mb-6 w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {checking ? 'בודקים התאמות...' : 'בדיקת התאמות אפשריות'}
      </button>

      <h2 className="mb-1 text-lg font-semibold text-slate-700">התאמות אפשריות ({matches.length})</h2>
      {matches.length === 0 && <p className="text-sm text-slate-400">לא בוצעה בדיקה עדיין, או שאין דיווחים במאגר.</p>}
      {matches.length > 0 && (
        <p className="mb-3 text-sm text-slate-500">
          {matches.filter((m) => m.status === REPORT_STATUS.NEW).length > 0
            ? `${matches.filter((m) => m.status === REPORT_STATUS.NEW).length} חדשות לבדיקה · הכי טובה ${matches[0].score}/100`
            : `כל ההתאמות נבדקו · הכי טובה ${matches[0].score}/100`}
        </p>
      )}

      <ul className="space-y-3">
        {matches.map((m) => {
          const report = reportsById[m.foundReportId];
          return (
            <li key={m.foundReportId} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-slate-800">רמת התאמה: {m.score}/100</span>
                <select
                  className="input w-auto text-xs"
                  value={m.status}
                  onChange={(e) => handleStatusChange(m.foundReportId, e.target.value)}
                >
                  {Object.entries(MATCH_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {report?.photos?.[0]?.url && (
                <button type="button" onClick={() => setLightboxUrl(report.photos[0].url)} className="mb-2 block w-full">
                  <img
                    src={report.photos[0].url}
                    alt=""
                    className="h-48 w-full rounded-lg bg-slate-50 object-contain ring-4 ring-amber-400"
                  />
                </button>
              )}

              <ul className="mb-2 list-inside list-disc text-sm text-slate-600">
                {m.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>

              {report && (
                <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                  {report.sourceGroupName && <p>מקור: {report.sourceGroupName}</p>}
                  {report.originalPosterName && <p>פורסם ע"י: {report.originalPosterName}</p>}
                  {report.contactPhone && <p>טלפון ליצירת קשר: {report.contactPhone}</p>}
                </div>
              )}

              <Link
                to={`/found/${m.foundReportId}`}
                className="mt-2 block text-center text-sm font-medium text-slate-600 underline"
              >
                צפייה בדיווח המלא
              </Link>
            </li>
          );
        })}
      </ul>

      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {dialog}
      {showDetails && (
        <RecordDetailsDialog
          title={lostCase.name || 'חתול ללא שם'}
          onClose={() => setShowDetails(false)}
          rows={[
            { label: 'שם', value: lostCase.name },
            { label: 'צבע', value: lostCase.color },
            { label: 'גודל', value: CAT_SIZES.find((s) => s.value === lostCase.size)?.label },
            { label: 'גור/מבוגר', value: CAT_AGE_CLASSES.find((a) => a.value === lostCase.ageClass)?.label },
            { label: 'סימנים מיוחדים', value: lostCase.markings },
            { label: 'אוזן קטומה', value: lostCase.hasClippedEar === true ? 'כן' : lostCase.hasClippedEar === false ? 'לא' : '' },
            { label: 'קולר/רתמה', value: lostCase.hasCollar === true ? 'כן' : lostCase.hasCollar === false ? 'לא' : '' },
            { label: 'צבע הקולר', value: lostCase.collarColor },
            { label: 'פעמון על הקולר', value: lostCase.collarHasBell === true ? 'כן' : lostCase.collarHasBell === false ? 'לא' : '' },
            { label: 'עיר', value: lostCase.city },
            { label: 'שכונה', value: lostCase.neighborhood },
            { label: 'פרטי מיקום נוספים', value: lostCase.lastSeenLocation },
            { label: 'מועד האובדן', value: lostCase.lastSeenAt },
            { label: 'תאריך מדויק', value: lostCase.lastSeenDate },
            { label: 'שם איש קשר', value: lostCase.contactName },
            { label: 'טלפון', value: lostCase.contactPhone },
            { label: 'הערות נוספות', value: lostCase.notes },
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
