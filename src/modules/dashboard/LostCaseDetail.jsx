import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import {
  COLLECTIONS,
  REPORT_STATUS,
  RECORD_STATUS,
  LOST_CASE_STATUS_LABELS,
  CAT_SIZES,
  CAT_FUR_TYPES,
  DOG_FUR_TYPES,
  COLLAR_COLORS,
  SPECIES,
  SPECIES_LABELS,
  CAT_PATTERN_DESCRIPTIONS,
} from '../shared/collections.js';
import Field from '../shared/Field.jsx';
import { useColorOptions } from '../shared/useColorOptions.js';
import { useBreedOptions } from '../shared/useBreedOptions.js';
import { usePatternOptions } from '../shared/usePatternOptions.js';
import ColorCheckDialog from '../shared/ColorCheckDialog.jsx';
import { petLabels } from '../shared/petLabels.js';
import {
  getLostCase,
  updateLostCase,
  updateLostCaseStatus,
  updateLostCaseClosure,
  removeLostCasePhoto,
  makeLostCasePhotoMain,
  deleteLostCase,
} from '../lost-report/lostReportApi.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { buildLostCaseSections } from '../lost-report/lostCaseSections.js';
import { shortSnippet } from '../shared/textSnippet.js';
import EditableTitle from '../shared/EditableTitle.jsx';
import { displayFoundReportName } from '../found-report/foundFieldMapping.js';
import { buildFoundReportSections } from '../found-report/foundReportSections.js';
import {
  checkMatchesForLostCase,
  checkSingleMatch,
  clearMatches,
  getMatches,
  updateMatchStatus,
} from '../matching/matchingApi.js';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { getMatchConfidence } from '../matching/matchingEngine.js';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import EditablePhotoGrid from '../shared/EditablePhotoGrid.jsx';
import FormSection from '../shared/FormSection.jsx';
import BackLink from '../shared/BackLink.jsx';
import ExtractionApproval from '../shared/ExtractionApproval.jsx';
import PhotoLightbox from '../shared/PhotoLightbox.jsx';
import NotifyOwnerDialog from '../shared/NotifyOwnerDialog.jsx';
import AnalyzingIndicator from '../shared/AnalyzingIndicator.jsx';
import { useConfirm } from '../shared/useConfirm.jsx';
import RecordStatusSelect from '../shared/RecordStatusSelect.jsx';
import DropdownBadge from '../shared/DropdownBadge.jsx';
import RecordDetailsDialog from '../shared/RecordDetailsDialog.jsx';
import ClosureDialog from '../shared/ClosureDialog.jsx';
import SelectField from '../shared/SelectField.jsx';
import { MATCH_STATUS_LABELS, MATCH_STATUS_COLORS } from '../matching/matchStatusLabels.js';

const EXTRACTION_FIELD_DEFS = [
  { targetKey: 'name', extractedKey: 'petName', label: 'שם החיה' },
  { targetKey: 'color', extractedKey: 'color', label: 'צבע' },
  { targetKey: 'pattern', extractedKey: 'pattern', label: 'תבנית פרווה' },
  { targetKey: 'breed', extractedKey: 'breed', label: 'גזע' },
  { targetKey: 'markings', extractedKey: 'markings', label: 'סימנים מיוחדים' },
  { targetKey: 'hasClippedEar', extractedKey: 'hasClippedEar', label: 'אוזן קטומה' },
  { targetKey: 'weightKg', extractedKey: 'weightKg', label: 'משקל' },
  { targetKey: 'microchipNumber', extractedKey: 'microchipNumber', label: 'מספר שבב' },
  { targetKey: 'hasCollar', extractedKey: 'hasCollar', label: 'קולר/רתמה' },
  { targetKey: 'collarColor', extractedKey: 'collarColor', label: 'צבע הקולר' },
  { targetKey: 'collarHasBell', extractedKey: 'collarHasBell', label: 'פעמון על הקולר' },
  { targetKey: 'city', extractedKey: 'city', label: 'עיר' },
  { targetKey: 'neighborhood', extractedKey: 'neighborhood', label: 'שכונה' },
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

export default function LostCaseDetail() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { user, isEditorOrAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [lostCase, setLostCase] = useState(null);
  const [matches, setMatches] = useState([]);
  const [reportsById, setReportsById] = useState({});
  const [checking, setChecking] = useState(false);
  // Brief "✓ done" confirmation right after a check completes, so pressing
  // the button always gives visible feedback that something happened -
  // without making any lasting claim about whether the check is "current"
  // or "up to date", since new lost cases/found reports can be added to
  // the pool at any time and only a fresh click ever reflects that.
  const [justChecked, setJustChecked] = useState(false);
  const [recheckingId, setRecheckingId] = useState(null);
  // Lets a link jump straight into edit mode (e.g. "עריכה" on a reverse
  // match card, from a found report's matching lost cases) instead of
  // landing on the view first and requiring an extra tap.
  const [editing, setEditing] = useState(() => searchParams.get('edit') === '1');
  const [fields, setFields] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]);
  const [newPhotosFirst, setNewPhotosFirst] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState(null);
  // Post-save nudge, same as the create forms' - fires on ANY save that
  // ends with color "אחר", not just an AI-driven one (a re-scan's applied
  // suggestion, or the person just picking "אחר" by hand both count).
  const [colorCheckPending, setColorCheckPending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showProcessed, setShowProcessed] = useState(false);
  const [confidenceColors, setConfidenceColors] = useState(undefined);
  const [pendingCloseStatus, setPendingCloseStatus] = useState(null);
  const {
    reading: extracting,
    error: extractError,
    read: extractFromPhotos,
    cancel: cancelExtracting,
  } = useScreenshotReader();
  const { confirm, dialog } = useConfirm();
  const colorOptions = useColorOptions(lostCase?.species);
  const breedOptions = useBreedOptions(lostCase?.species);
  const patternOptions = usePatternOptions();
  const patternSelectOptions = patternOptions.map((p) => ({ value: p, label: p, description: CAT_PATTERN_DESCRIPTIONS[p] }));
  const furTypeOptions = lostCase?.species === SPECIES.DOG ? DOG_FUR_TYPES : CAT_FUR_TYPES;
  const labels = petLabels(lostCase?.species);

  useEffect(() => {
    load();
  }, [caseId]);

  useEffect(() => {
    getMatchConfig().then((c) => setConfidenceColors(c.confidenceColors));
  }, []);

  // Compares against the last-loaded/last-saved case, not just whether
  // edit mode is open - entering edit mode without touching anything
  // shouldn't trigger an "unsaved changes" prompt on the way back out.
  const isDirty = editing && (newPhotos.length > 0 || JSON.stringify(fields) !== JSON.stringify(lostCase));

  // Editing this form means scrolling past a lot of fields to reach Save -
  // losing that on an accidental tab close/refresh is a real, already-
  // reported way to lose real edits (e.g. after fixing a bad main photo).
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  async function handleBackToHome() {
    if (isDirty && !(await confirm('יש שינויים שלא נשמרו. לצאת בכל זאת?', { confirmLabel: 'לצאת בלי לשמור', danger: true }))) {
      return;
    }
    navigate('/');
  }

  async function handleBackInHistory() {
    if (isDirty && !(await confirm('יש שינויים שלא נשמרו. לצאת בכל זאת?', { confirmLabel: 'לצאת בלי לשמור', danger: true }))) {
      return;
    }
    navigate(-1);
  }

  async function load() {
    const data = await getLostCase(caseId);
    setLostCase(data);
    setFields(data);
    const existingMatches = await getMatches(caseId);
    setMatches(existingMatches);
    await loadReportSnapshots(existingMatches);
  }

  // Quick rename from the pencil on the view header - saves just the name,
  // without needing to open full edit mode. Updates both lostCase and
  // fields so a subsequent "עריכה" starts from the renamed value too.
  async function handleQuickRename(newName) {
    await updateLostCase(caseId, { ...lostCase, name: newName }, []);
    setLostCase((prev) => ({ ...prev, name: newName }));
    setFields((prev) => (prev ? { ...prev, name: newName } : prev));
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

  function flashJustChecked() {
    setJustChecked(true);
    setTimeout(() => setJustChecked(false), 2500);
  }

  async function handleCheckMatches() {
    setChecking(true);
    try {
      await checkMatchesForLostCase(caseId);
      await load();
      flashJustChecked();
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
      flashJustChecked();
    } finally {
      setChecking(false);
    }
  }

  async function handleStatusChange(foundReportId, status) {
    await updateMatchStatus(caseId, foundReportId, status);
    setMatches((prev) => prev.map((m) => (m.foundReportId === foundReportId ? { ...m, status } : m)));
  }

  // Re-scores just this one pairing - useful right after editing the found
  // report's details (from the same match card) to see the effect
  // immediately, without re-running the full check against every found
  // report again.
  async function handleRecheckSingleMatch(foundReportId) {
    setRecheckingId(foundReportId);
    try {
      await checkSingleMatch(caseId, foundReportId);
      await load();
    } finally {
      setRecheckingId(null);
    }
  }

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  // Archiving or resolving a case closes it out - prompt for the closure
  // details right then (see ClosureDialog) instead of applying the status
  // change immediately, so a closed case is never left without them.
  async function handleRecordStatusChange(status) {
    if (status === RECORD_STATUS.ARCHIVED || status === RECORD_STATUS.RESOLVED) {
      setPendingCloseStatus(status);
      return;
    }
    await updateLostCaseStatus(caseId, status);
    setLostCase((prev) => ({ ...prev, status }));
  }

  // Once a case is closed there's nothing left to do on its detail page
  // (matches, edit form) - head back to the working dashboard instead of
  // staying on a page for a case that's no longer active.
  async function handleConfirmClosure(closure) {
    await updateLostCaseClosure(caseId, pendingCloseStatus, closure);
    setPendingCloseStatus(null);
    navigate('/');
  }

  // Same reasoning as handleConfirmClosure - once a match is confirmed via
  // NotifyOwnerDialog's checkbox, both records are already closed by the
  // time this fires, so there's nothing left to do on this page.
  function handleMatchResolved() {
    navigate('/');
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
      const result = await extractFromPhotos(files, '', lostCase.species);
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
      if (fields.color === 'אחר') {
        setColorCheckPending(true);
      } else {
        setEditing(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleColorCheckSave(newColor) {
    await updateLostCase(caseId, { ...fields, color: newColor }, []);
    setColorCheckPending(false);
    setEditing(false);
    await load();
  }

  async function handleColorCheckSkip() {
    setColorCheckPending(false);
    setEditing(false);
    await load();
  }

  if (!lostCase) return <p className="p-4 text-slate-500">טוען...</p>;

  // A regular user can manage only what they created; editors/admins can
  // manage everything. Viewing and running matches stay open to everyone
  // regardless (see collections.js / firestore.rules).
  const canManage = isEditorOrAdmin || lostCase.ownerId === user.uid;
  // A ?edit=1 deep link (e.g. from a found report's matching lost cases)
  // still only works for someone who's actually allowed to edit - anyone
  // else lands on the normal view instead.
  const showEditForm = editing && canManage;

  const newMatches = matches.filter((m) => m.status === REPORT_STATUS.NEW);
  const processedMatches = matches.filter((m) => m.status !== REPORT_STATUS.NEW);

  return (
    <div className="p-4">
      <BackLink onClick={handleBackToHome} onBack={handleBackInHistory}>
        לעמוד הראשי
      </BackLink>

      {!showEditForm ? (
        <>
          <MainPhoto photo={lostCase.photos?.[0]} onView={setLightboxUrl} />
          <div className="mb-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <EditableTitle
                value={lostCase.name}
                displayText={displayLostCaseName(lostCase)}
                defaultDraft={shortSnippet(lostCase.markings)}
                onSave={handleQuickRename}
              />
              <RecordStatusSelect
                status={lostCase.status || RECORD_STATUS.ACTIVE}
                labels={LOST_CASE_STATUS_LABELS}
                onChange={handleRecordStatusChange}
              />
            </div>
            <p className="mb-2 text-sm text-slate-500">
              {lostCase.color} · {lostCase.neighborhood} · {lostCase.lastSeenAt}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setShowDetails(true)} className="text-sm text-slate-600 underline">
                  פרטים מלאים
                </button>
                {canManage && (
                  <button onClick={() => setEditing(true)} className="text-sm text-slate-600 underline">
                    עריכה
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {canManage && (
                  <button onClick={handleDelete} disabled={deleting} className="text-sm text-red-600 underline disabled:opacity-50">
                    {deleting ? 'מוחקים...' : 'מחיקת התיק'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    handleRecordStatusChange(
                      lostCase.status === RECORD_STATUS.ARCHIVED || lostCase.status === RECORD_STATUS.RESOLVED
                        ? lostCase.status
                        : RECORD_STATUS.ARCHIVED
                    )
                  }
                  className="text-sm text-slate-600 underline"
                >
                  ארכיון
                </button>
              </div>
            </div>
          </div>
          {lostCase.markings && <p className="mb-2 whitespace-pre-line text-sm text-slate-600">{lostCase.markings}</p>}
          {lostCase.contactPhone && (
            <p className="mb-2 text-sm text-slate-600">טלפון: {lostCase.contactPhone}</p>
          )}
          {(lostCase.sourceGroupName || lostCase.originalPosterName || lostCase.sourceUrl) && (
            <div className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
              {lostCase.sourceGroupName && <p>מקור: {lostCase.sourceGroupName}</p>}
              {lostCase.originalPosterName && <p>פורסם ע"י: {lostCase.originalPosterName}</p>}
              {lostCase.sourceUrl && (
                <a href={lostCase.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                  צפייה בפוסט המקורי
                </a>
              )}
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
          <FormSection title={labels.petDetailsSection}>
            <Field label={labels.nameLabel}>
              <input className="input" value={fields.name || ''} onChange={(e) => setField('name', e.target.value)} />
            </Field>
            <Field label="מין" inline>
              <span className="text-sm text-slate-600">{SPECIES_LABELS[lostCase.species] || SPECIES_LABELS[SPECIES.CAT]}</span>
            </Field>
            <Field label="צבע" inline>
              <SelectField
                className="w-full max-w-[9rem]"
                label="בחירת צבע"
                placeholder="בחר/י צבע"
                value={fields.color || ''}
                onChange={(v) => setField('color', v)}
                options={colorOptions}
              />
            </Field>
            {lostCase.species === SPECIES.CAT && (
              <Field label="תבנית פרווה" inline>
                <SelectField
                  className="w-full max-w-[9rem]"
                  label="בחירת תבנית פרווה"
                  placeholder="בחר/י תבנית"
                  value={fields.pattern || ''}
                  onChange={(v) => setField('pattern', v)}
                  options={patternSelectOptions}
                />
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={fields.ageClass === 'kitten'}
                onChange={(e) => setField('ageClass', e.target.checked ? 'kitten' : 'adult')}
              />
              גור
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!fields.hasCollar}
                onChange={(e) => setField('hasCollar', e.target.checked)}
              />
              קולר
            </label>
            {fields.hasCollar && (
              <>
                <Field label="צבע הקולר" inline>
                  <SelectField
                    className="w-full max-w-[9rem]"
                    label="בחירת צבע קולר"
                    placeholder="בחר/י צבע"
                    value={fields.collarColor || ''}
                    onChange={(v) => setField('collarColor', v)}
                    options={COLLAR_COLORS}
                  />
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
            <Field label={labels.breedLabel} inline>
              <SelectField
                className="w-full max-w-[9rem]"
                label="בחירת גזע"
                placeholder="בחר/י גזע"
                value={fields.breed || ''}
                onChange={(v) => setField('breed', v)}
                options={breedOptions}
              />
            </Field>
            {lostCase.species === SPECIES.DOG && (
              <>
                <Field label="משקל (ק״ג, אם ידוע)" inline>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="input w-full max-w-[9rem]"
                    value={fields.weightKg || ''}
                    onChange={(e) => setField('weightKg', e.target.value)}
                  />
                </Field>
                <Field label="מספר שבב (אם ידוע)" inline>
                  <input
                    className="input w-full max-w-[9rem]"
                    value={fields.microchipNumber || ''}
                    onChange={(e) => setField('microchipNumber', e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field label={labels.furTypeLabel} inline>
              <SelectField
                className="w-full max-w-[9rem]"
                label={labels.furTypeLabel}
                value={fields.furType || ''}
                onChange={(v) => setField('furType', v)}
                options={furTypeOptions}
              />
            </Field>
            <Field label="גודל" inline>
              <SelectField
                className="w-full max-w-[9rem]"
                label="בחירת גודל"
                value={fields.size || ''}
                onChange={(v) => setField('size', v)}
                options={CAT_SIZES}
              />
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
            <Field label="קישור לפוסט המקורי">
              <input
                className="input"
                type="url"
                dir="ltr"
                value={fields.sourceUrl || ''}
                onChange={(e) => setField('sourceUrl', e.target.value)}
                placeholder="https://www.facebook.com/..."
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
        {checking ? 'בודקים התאמות...' : justChecked ? '✓ הבדיקה הושלמה' : matches.length === 0 ? 'בדיקת התאמות אפשריות' : 'בדיקה חוזרת'}
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

      <h2 className="mb-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-700">
        התאמות אפשריות ({matches.length})
        {newMatches.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {newMatches.length} ממתינות לבדיקה
          </span>
        )}
      </h2>
      {matches.length === 0 && <p className="text-sm text-slate-400">לא בוצעה בדיקה עדיין, או שאין דיווחים במאגר.</p>}
      {matches.length > 0 && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          הכי טובה: <ConfidenceBadge score={matches[0].score} confidenceColors={confidenceColors} />
        </p>
      )}

      {newMatches.length > 0 ? (
        <ul className="space-y-3">
          {newMatches.map((m) => (
            <MatchCard
              key={m.foundReportId}
              match={m}
              report={reportsById[m.foundReportId]}
              lostCase={lostCase}
              onStatusChange={handleStatusChange}
              onViewPhoto={setLightboxUrl}
              confidenceColors={confidenceColors}
              caseId={caseId}
              onRecheck={handleRecheckSingleMatch}
              rechecking={recheckingId === m.foundReportId}
              onResolved={handleMatchResolved}
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
                  lostCase={lostCase}
                  onStatusChange={handleStatusChange}
                  onViewPhoto={setLightboxUrl}
                  confidenceColors={confidenceColors}
                  caseId={caseId}
                  onResolved={handleMatchResolved}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {dialog}
      {colorCheckPending && (
        <ColorCheckDialog colorOptions={colorOptions} onSave={handleColorCheckSave} onSkip={handleColorCheckSkip} />
      )}
      {pendingCloseStatus && (
        <ClosureDialog
          initialDate={lostCase.closureDate}
          initialReason={lostCase.closureReason}
          initialClosedBy={lostCase.closedBy}
          initialComment={lostCase.closingComment}
          onConfirm={handleConfirmClosure}
          onCancel={() => setPendingCloseStatus(null)}
        />
      )}
      {showDetails && (
        <RecordDetailsDialog
          title={displayLostCaseName(lostCase)}
          onClose={() => setShowDetails(false)}
          photos={lostCase.photos}
          onViewPhoto={setLightboxUrl}
          sections={buildLostCaseSections(lostCase)}
        />
      )}
    </div>
  );
}

function MatchCard({
  match,
  report,
  lostCase,
  onStatusChange,
  onViewPhoto,
  confidenceColors,
  caseId,
  onRecheck,
  rechecking,
  onResolved,
}) {
  const [showCatDetails, setShowCatDetails] = useState(false);
  const [showNotify, setShowNotify] = useState(false);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex shrink-0 items-center gap-2 font-medium text-slate-800">
          רמת התאמה: <ConfidenceBadge score={match.score} confidenceColors={confidenceColors} />
        </span>
        <button
          type="button"
          onClick={() => onRecheck(match.foundReportId)}
          disabled={rechecking}
          className="shrink-0 whitespace-nowrap text-xs text-slate-500 underline disabled:opacity-50"
        >
          {rechecking ? 'מרענן...' : 'רענן בדיקה'}
        </button>
      </div>
      <div className="mb-2 flex justify-end">
        <DropdownBadge
          value={match.status}
          labels={MATCH_STATUS_LABELS}
          onChange={(status) => onStatusChange(match.foundReportId, status)}
          colorClass={MATCH_STATUS_COLORS[match.status] || 'bg-slate-100 text-slate-600'}
        />
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
          {report.sourceUrl && (
            <a href={report.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              צפייה בפוסט המקורי
            </a>
          )}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setShowCatDetails(true)}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600"
        >
          {petLabels(report?.species).petDetailsSection}
        </button>
        <Link
          to={`/found/${match.foundReportId}?edit=1`}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-center text-sm font-medium text-slate-600"
        >
          עריכה
        </Link>
        <Link
          to={`/lost/${caseId}/analysis/${match.foundReportId}`}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-center text-sm font-medium text-slate-600"
        >
          ניתוח מלא
        </Link>
      </div>

      <button
        type="button"
        onClick={() => setShowNotify(true)}
        className="mt-2 w-full rounded-lg bg-emerald-50 py-2 text-sm font-medium text-emerald-700"
      >
        📱 עדכון הבעלים בוואטסאפ
      </button>

      {showCatDetails && report && (
        <RecordDetailsDialog
          title={displayFoundReportName(report)}
          onClose={() => setShowCatDetails(false)}
          photos={report.photos}
          onViewPhoto={onViewPhoto}
          sections={buildFoundReportSections(report)}
        />
      )}

      {showNotify && (
        <NotifyOwnerDialog
          lostCase={lostCase}
          report={report}
          foundReportId={match.foundReportId}
          onClose={() => setShowNotify(false)}
          onSent={() => onStatusChange(match.foundReportId, REPORT_STATUS.CONTACTED)}
          onResolved={onResolved}
        />
      )}
    </li>
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
