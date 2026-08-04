import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, REPORT_STATUS, RECORD_STATUS, LOST_CASE_STATUS_LABELS, CAT_COLORS } from '../shared/collections.js';
import { getLostCase, updateLostCase, updateLostCaseStatus, removeLostCasePhoto, deleteLostCase } from '../lost-report/lostReportApi.js';
import { checkMatchesForLostCase, getMatches, updateMatchStatus } from '../matching/matchingApi.js';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import ExtractionApproval from '../shared/ExtractionApproval.jsx';
import PhotoLightbox from '../shared/PhotoLightbox.jsx';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { useConfirm } from '../shared/useConfirm.jsx';
import RecordStatusSelect from '../shared/RecordStatusSelect.jsx';

const EXTRACTION_FIELD_DEFS = [
  { targetKey: 'name', extractedKey: 'petName', label: 'שם החתולה' },
  { targetKey: 'color', extractedKey: 'colorDescription', label: 'צבע' },
  { targetKey: 'markings', extractedKey: 'markings', label: 'סימנים מזהים' },
  { targetKey: 'hasCollar', extractedKey: 'hasCollar', label: 'קולר/רתמה' },
  { targetKey: 'lastSeenLocation', extractedKey: 'location', label: 'מקום אחרון שנראתה' },
  { targetKey: 'lastSeenAt', extractedKey: 'dateText', label: 'מועד האובדן' },
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
            confirm={confirm}
          />
          {lostCase.markings && <p className="mb-2 text-sm text-slate-600">{lostCase.markings}</p>}
          {lostCase.contactPhone && (
            <p className="mb-2 text-sm text-slate-600">טלפון: {lostCase.contactPhone}</p>
          )}
        </>
      ) : (
        <div className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <EditablePhotoGrid
            existingPhotos={fields.photos || []}
            onRemoveExisting={handleRemoveExistingPhoto}
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
          <Field label="סימנים מזהים">
            <textarea className="input" value={fields.markings || ''} onChange={(e) => setField('markings', e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!fields.hasCollar}
              onChange={(e) => setField('hasCollar', e.target.checked)}
            />
            לובשת קולר/רתמה
          </label>
          <Field label="מקום אחרון שנראתה">
            <input
              className="input"
              value={fields.lastSeenLocation || ''}
              onChange={(e) => setField('lastSeenLocation', e.target.value)}
            />
          </Field>
          <Field label="מועד האובדן">
            <input className="input" value={fields.lastSeenAt || ''} onChange={(e) => setField('lastSeenAt', e.target.value)} />
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

      <h2 className="mb-3 text-lg font-semibold text-slate-700">התאמות אפשריות ({matches.length})</h2>
      {matches.length === 0 && <p className="text-sm text-slate-400">לא בוצעה בדיקה עדיין, או שאין דיווחים במאגר.</p>}

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
                <img src={report.photos[0].url} alt="" className="mb-2 h-40 w-full rounded-lg object-cover" />
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
            </li>
          );
        })}
      </ul>

      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {dialog}
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

function PhotoGallery({ photos, onView, onRemove, confirm }) {
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
              className="h-56 w-auto max-w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
            />
          </button>
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
