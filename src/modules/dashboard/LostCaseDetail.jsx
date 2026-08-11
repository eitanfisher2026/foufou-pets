import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import {
  COLLECTIONS,
  REPORT_STATUS,
  RECORD_STATUS,
  LOST_CASE_STATUS_LABELS,
  CAT_SIZES,
  CAT_AGE_CLASSES,
  CAT_FUR_TYPES,
  COLLAR_COLORS,
} from '../shared/collections.js';
import { formatDate } from '../shared/formatDate.js';
import { useColorOptions } from '../shared/useColorOptions.js';
import {
  getLostCase,
  updateLostCase,
  updateLostCaseStatus,
  removeLostCasePhoto,
  makeLostCasePhotoMain,
  deleteLostCase,
} from '../lost-report/lostReportApi.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { checkMatchesForLostCase, clearMatches, getMatches, updateMatchStatus } from '../matching/matchingApi.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { getMatchConfidence } from '../matching/matchingEngine.js';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';
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
  { targetKey: 'colorDescription', extractedKey: 'colorDescription', label: 'תיאור נוסף לצבע' },
  { targetKey: 'breed', extractedKey: 'breed', label: 'גזע' },
  { targetKey: 'hasFluffyTail', extractedKey: 'hasFluffyTail', label: 'זנב שעיר במיוחד' },
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
  { targetKey: 'sourceGroupName', extractedKey: 'sourceGroupName', label: 'מקור המידע (קבוצה)' },
  { targetKey: 'originalPosterName', extractedKey: 'originalPosterName', label: 'מי כתב את הפוסט' },
  { targetKey: 'sharedByName', extractedKey: 'sharedByName', label: 'מי שיתף' },
  { targetKey: 'postAgeText', extractedKey: 'postAgeText', label: 'מתי פורסם' },
];

const MATCH_STATUS_LABELS = {
  [REPORT_STATUS.NEW]: 'חדש',
  [REPORT_STATUS.NO_MATCH]: 'האלגוריתם קבע: אין התאמה',
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
  const [newPhotosFirst, setNewPhotosFirst] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showProcessed, setShowProcessed] = useState(false);
  const [confidenceColors, setConfidenceColors] = useState(undefined);
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
  }, [caseId]);

  useEffect(() => {
    getMatchConfig().then((c) => setConfidenceColors(c.confidenceColors));
  }, []);

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

  async function handleClearAndRecheck() {
    const ok = await confirm(
      'למחוק את כל ההתאמות הקיימות עבור התיק הזה - כולל סטטוסים שנקבעו ידנית - ולבדוק הכל מחדש מאפס?',
      { confirmLabel: 'איפוס ובדיקה מחדש', danger: true }
    );
    if (!ok) return;
    setChecking(true);
    try {
      await clearMatches(caseId);
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
      await updateLostCase(caseId, fields, newPhotos);
      if (newPhotosFirst && newPhotos.length > 0) {
        const fresh = await getLostCase(caseId);
        const promoted = fresh.photos?.[existingCountBeforeSave];
        if (promoted) await makeLostCasePhotoMain(caseId, promoted, fresh.photos);
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

  if (!lostCase) return <p className="p-4 text-slate-500">טוען...</p>;

  const newMatches = matches.filter((m) => m.status === REPORT_STATUS.NEW);
  const processedMatches = matches.filter((m) => m.status !== REPORT_STATUS.NEW);

  return (
    <div className="p-4">
      <button type="button" onClick={handleBackToHome} className="mb-4 inline-block text-sm text-slate-500 underline">
        ← חזרה לעמוד הראשי
      </button>

      {!editing ? (
        <>
          <MainPhoto photo={lostCase.photos?.[0]} onView={setLightboxUrl} />
          <div className="mb-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-xl font-bold text-slate-800">{displayLostCaseName(lostCase)}</h1>
              <RecordStatusSelect
                status={lostCase.status || RECORD_STATUS.ACTIVE}
                labels={LOST_CASE_STATUS_LABELS}
                onChange={handleRecordStatusChange}
              />
            </div>
            <p className="mb-2 text-sm text-slate-500">
              {lostCase.color} · {lostCase.lastSeenLocation} · {lostCase.lastSeenAt}
            </p>
            <div className="flex flex-wrap gap-3">
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
          {lostCase.markings && <p className="mb-2 whitespace-pre-line text-sm text-slate-600">{lostCase.markings}</p>}
          {lostCase.contactPhone && (
            <p className="mb-2 text-sm text-slate-600">טלפון: {lostCase.contactPhone}</p>
          )}
          {(lostCase.sourceGroupName || lostCase.originalPosterName) && (
            <div className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
              {lostCase.sourceGroupName && <p>מקור: {lostCase.sourceGroupName}</p>}
              {lostCase.originalPosterName && <p>פורסם ע"י: {lostCase.originalPosterName}</p>}
            </div>
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
            newPhotosFirst={newPhotosFirst}
            onNewPhotosFirstChange={setNewPhotosFirst}
          />
          <Field label="מקור המידע (שם הקבוצה) - אם שונה מדיווח אישי">
            <input
              className="input"
              value={fields.sourceGroupName || ''}
              onChange={(e) => setField('sourceGroupName', e.target.value)}
            />
          </Field>
          <Field label="מי כתב את הפוסט המקורי (אם לא הבעלים עצמם)">
            <input
              className="input"
              value={fields.originalPosterName || ''}
              onChange={(e) => setField('originalPosterName', e.target.value)}
            />
          </Field>
          <Field label="מי שיתף את הפוסט לקבוצה הזו (אם שונה מהכותב)">
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
          <Field label="שם החתולה">
            <input className="input" value={fields.name || ''} onChange={(e) => setField('name', e.target.value)} />
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
          <Field label="תיאור נוסף לצבע (תבניות, כתמים וכו')">
            <input
              className="input"
              value={fields.colorDescription || ''}
              onChange={(e) => setField('colorDescription', e.target.value)}
            />
          </Field>
          <Field label="גזע (אם ידוע - רוב חתולי הרחוב הם ללא גזע מסוים)">
            <input className="input" value={fields.breed || ''} onChange={(e) => setField('breed', e.target.value)} />
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
          <Field label="סוג פרווה">
            <select className="input" value={fields.furType || ''} onChange={(e) => setField('furType', e.target.value)}>
              <option value="">בחר/י</option>
              {CAT_FUR_TYPES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!fields.hasFluffyTail}
              onChange={(e) => setField('hasFluffyTail', e.target.checked)}
            />
            זנב שעיר/פלומתי במיוחד
          </label>
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
                  ...('lastSeenDate' in updates
                    ? { lastSeenDateApprox: pendingExtraction.computedDateApprox ?? prev.lastSeenDateApprox }
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
                setFields(lostCase);
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

      <button
        onClick={handleCheckMatches}
        disabled={checking}
        className="w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {checking ? 'בודקים התאמות...' : 'בדיקת התאמות אפשריות'}
      </button>
      {matches.length > 0 && (
        <button
          onClick={handleClearAndRecheck}
          disabled={checking}
          className="mb-6 mt-2 w-full text-center text-xs text-slate-400 underline disabled:opacity-50"
        >
          איפוס כל ההתאמות (כולל סטטוסים) ובדיקה מחדש
        </button>
      )}
      {matches.length === 0 && <div className="mb-6" />}

      <h2 className="mb-1 text-lg font-semibold text-slate-700">התאמות אפשריות ({matches.length})</h2>
      {matches.length === 0 && <p className="text-sm text-slate-400">לא בוצעה בדיקה עדיין, או שאין דיווחים במאגר.</p>}
      {matches.length > 0 && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {newMatches.length > 0 ? `${newMatches.length} חדשות לבדיקה · הכי טובה` : 'כל ההתאמות טופלו · הכי טובה'}
          <ConfidenceBadge score={matches[0].score} confidenceColors={confidenceColors} />
        </p>
      )}

      {newMatches.length > 0 ? (
        <ul className="space-y-3">
          {newMatches.map((m) => (
            <MatchCard
              key={m.foundReportId}
              match={m}
              report={reportsById[m.foundReportId]}
              onStatusChange={handleStatusChange}
              onViewPhoto={setLightboxUrl}
              confidenceColors={confidenceColors}
            />
          ))}
        </ul>
      ) : (
        matches.length > 0 && <p className="text-sm text-slate-400">אין התאמות חדשות שטרם נבדקו.</p>
      )}

      {processedMatches.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowProcessed((v) => !v)} className="mb-3 text-sm text-slate-500 underline">
            {showProcessed ? 'הסתרת' : 'הצגת'} {processedMatches.length} התאמות שכבר טופלו
          </button>
          {showProcessed && (
            <ul className="space-y-3">
              {processedMatches.map((m) => (
                <MatchCard
                  key={m.foundReportId}
                  match={m}
                  report={reportsById[m.foundReportId]}
                  onStatusChange={handleStatusChange}
                  onViewPhoto={setLightboxUrl}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {dialog}
      {showDetails && (
        <RecordDetailsDialog
          title={displayLostCaseName(lostCase)}
          onClose={() => setShowDetails(false)}
          photos={lostCase.photos}
          onViewPhoto={setLightboxUrl}
          rows={[
            { label: 'שם', value: lostCase.name },
            { label: 'תיאור נוסף לצבע', value: lostCase.colorDescription },
            { label: 'גזע', value: lostCase.breed },
            { label: 'צבע', value: lostCase.color },
            { label: 'גודל', value: CAT_SIZES.find((s) => s.value === lostCase.size)?.label },
            { label: 'גור/מבוגר', value: CAT_AGE_CLASSES.find((a) => a.value === lostCase.ageClass)?.label },
            { label: 'סוג פרווה', value: CAT_FUR_TYPES.find((f) => f.value === lostCase.furType)?.label },
            { label: 'זנב שעיר במיוחד', value: lostCase.hasFluffyTail === true ? 'כן' : lostCase.hasFluffyTail === false ? 'לא' : '' },
            { label: 'סימנים מיוחדים', value: lostCase.markings },
            { label: 'אוזן קטומה', value: lostCase.hasClippedEar === true ? 'כן' : lostCase.hasClippedEar === false ? 'לא' : '' },
            { label: 'קולר/רתמה', value: lostCase.hasCollar === true ? 'כן' : lostCase.hasCollar === false ? 'לא' : '' },
            { label: 'צבע הקולר', value: lostCase.collarColor },
            { label: 'פעמון על הקולר', value: lostCase.collarHasBell === true ? 'כן' : lostCase.collarHasBell === false ? 'לא' : '' },
            { label: 'עיר', value: lostCase.city },
            { label: 'שכונה', value: lostCase.neighborhood },
            { label: 'פרטי מיקום נוספים', value: lostCase.lastSeenLocation },
            { label: 'מועד האובדן', value: lostCase.lastSeenAt },
            {
              label: 'תאריך מדויק',
              value: lostCase.lastSeenDate
                ? `${formatDate(lostCase.lastSeenDate)}${lostCase.lastSeenDateApprox ? ' (משוער)' : ''}`
                : '',
            },
            { label: 'שם איש קשר', value: lostCase.contactName },
            { label: 'טלפון', value: lostCase.contactPhone },
            { label: 'הערות נוספות', value: lostCase.notes },
            { label: 'מקור המידע (קבוצה)', value: lostCase.sourceGroupName },
            { label: 'מי כתב את הפוסט', value: lostCase.originalPosterName },
            { label: 'מי שיתף', value: lostCase.sharedByName },
            { label: 'מתי פורסם', value: lostCase.postAgeText },
          ]}
        />
      )}
    </div>
  );
}

function MatchCard({ match, report, onStatusChange, onViewPhoto, confidenceColors }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium text-slate-800">
          רמת התאמה: <ConfidenceBadge score={match.score} confidenceColors={confidenceColors} />
        </span>
        <select
          className="input w-auto text-xs"
          value={match.status}
          onChange={(e) => onStatusChange(match.foundReportId, e.target.value)}
        >
          {Object.entries(MATCH_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {report?.photos?.[0]?.url && (
        <button type="button" onClick={() => onViewPhoto(report.photos[0].url)} className="mb-2 block w-full">
          <img
            src={report.photos[0].url}
            alt=""
            className="h-48 w-full rounded-lg bg-slate-50 object-contain ring-4 ring-amber-400"
          />
        </button>
      )}

      <ul className="mb-2 list-inside list-disc text-sm text-slate-600">
        {match.reasons.map((reason, i) => (
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

      <Link to={`/found/${match.foundReportId}`} className="mt-2 block text-center text-sm font-medium text-slate-600 underline">
        צפייה בדיווח המלא
      </Link>
    </li>
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
