import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
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
  REPORT_STATUS,
  FOUND_REPORT_STATUS_LABELS,
  CAT_SIZES,
  CAT_FUR_TYPES,
  DOG_FUR_TYPES,
  COLLAR_COLORS,
  CAT_CONDITIONS,
  SPECIES,
  CAT_PATTERN_DESCRIPTIONS,
} from '../shared/collections.js';
import { useColorOptions } from '../shared/useColorOptions.js';
import { useBreedOptions } from '../shared/useBreedOptions.js';
import { usePatternOptions } from '../shared/usePatternOptions.js';
import ColorCheckDialog from '../shared/ColorCheckDialog.jsx';
import { petLabels } from '../shared/petLabels.js';
import { displayFoundReportName } from './foundFieldMapping.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { buildLostCaseSections } from '../lost-report/lostCaseSections.js';
import { deleteLostCase } from '../lost-report/lostReportApi.js';
import { shortSnippet } from '../shared/textSnippet.js';
import EditableTitle from '../shared/EditableTitle.jsx';
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
import SelectField from '../shared/SelectField.jsx';
import { buildFoundReportSections } from './foundReportSections.js';
import {
  checkMatchesForFoundReport,
  checkSingleMatch,
  clearMatchesForFoundReport,
  countNewCandidatesForFoundReport,
  getMatchesForFoundReport,
  updateMatchStatus,
} from '../matching/matchingApi.js';
import { useVisualMatchAlert } from '../shared/useVisualMatchAlert.jsx';
import { getMatchConfig } from '../matching/matchConfigApi.js';
import { MATCH_STATUS_LABELS, MATCH_STATUS_COLORS } from '../matching/matchStatusLabels.js';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';
import VisualSimilarityNote from '../shared/VisualSimilarityNote.jsx';
import DropdownBadge from '../shared/DropdownBadge.jsx';
import NotifyOwnerDialog from '../shared/NotifyOwnerDialog.jsx';

const EXTRACTION_FIELD_DEFS = [
  { targetKey: 'sourceGroupName', extractedKey: 'sourceGroupName', label: 'מקור המידע (קבוצה)' },
  { targetKey: 'originalPosterName', extractedKey: 'originalPosterName', label: 'מי כתב את הפוסט' },
  { targetKey: 'sharedByName', extractedKey: 'sharedByName', label: 'מי שיתף' },
  { targetKey: 'postAgeText', extractedKey: 'postAgeText', label: 'מתי פורסם' },
  { targetKey: 'color', extractedKey: 'color', label: 'צבע' },
  { targetKey: 'pattern', extractedKey: 'pattern', label: 'תבנית פרווה' },
  { targetKey: 'breed', extractedKey: 'breed', label: 'גזע' },
  { targetKey: 'markings', extractedKey: 'markings', label: 'סימנים מיוחדים' },
  { targetKey: 'hasClippedEar', extractedKey: 'hasClippedEar', label: 'אוזן קטומה' },
  { targetKey: 'weightKg', extractedKey: 'weightKg', label: 'משקל' },
  { targetKey: 'microchipNumber', extractedKey: 'microchipNumber', label: 'מספר שבב' },
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
  const { user, isEditorOrAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [report, setReport] = useState(null);
  // Lets a link jump straight into edit mode (e.g. "עריכה" on a match card
  // during match review) instead of landing on the view first and requiring
  // an extra tap.
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
  const [matches, setMatches] = useState([]);
  const [checking, setChecking] = useState(false);
  // Brief "✓ done" confirmation right after a check completes, so pressing
  // the button always gives visible feedback that something happened -
  // without making any lasting claim about whether the check is "current"
  // or "up to date", since new lost cases/found reports can be added to
  // the pool at any time and only a fresh click ever reflects that.
  const [justChecked, setJustChecked] = useState(false);
  const [recheckingId, setRecheckingId] = useState(null);
  const [showProcessedMatches, setShowProcessedMatches] = useState(false);
  const [showNoMatch, setShowNoMatch] = useState(false);
  // How many active lost cases have never been compared against this
  // report at all - distinct from matches.length, which counts pairings
  // that already have a scored record (whether awaiting review, no-match,
  // or already triaged). Computed live, not denormalized, since it depends
  // on the whole lost-cases pool.
  const [newCandidateCount, setNewCandidateCount] = useState(0);
  const [confidenceColors, setConfidenceColors] = useState(undefined);
  const {
    reading: extracting,
    error: extractError,
    read: extractFromPhotos,
    cancel: cancelExtracting,
  } = useScreenshotReader();
  const { confirm, dialog } = useConfirm();
  const { notify: notifyVisualMatch, dialog: visualMatchDialog } = useVisualMatchAlert();
  const colorOptions = useColorOptions(report?.species);
  const breedOptions = useBreedOptions(report?.species);
  const patternOptions = usePatternOptions();
  const patternSelectOptions = patternOptions.map((p) => ({ value: p, label: p, description: CAT_PATTERN_DESCRIPTIONS[p] }));
  const furTypeOptions = report?.species === SPECIES.DOG ? DOG_FUR_TYPES : CAT_FUR_TYPES;
  const labels = petLabels(report?.species);

  useEffect(() => {
    load();
  }, [reportId]);

  useEffect(() => {
    getMatchConfig().then((c) => setConfidenceColors(c.confidenceColors));
  }, []);

  // Compares against the last-loaded/last-saved report, not just whether
  // edit mode is open - entering edit mode without touching anything
  // shouldn't trigger an "unsaved changes" prompt on the way back out.
  const isDirty = editing && (newPhotos.length > 0 || JSON.stringify(fields) !== JSON.stringify(report));

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
    const data = await getFoundReport(reportId);
    setReport(data);
    setFields(data);
    setMatches(await getMatchesForFoundReport(reportId));
    setNewCandidateCount(await countNewCandidatesForFoundReport(reportId));
  }

  function flashJustChecked() {
    setJustChecked(true);
    setTimeout(() => setJustChecked(false), 2500);
  }

  async function handleCheckMatches() {
    setChecking(true);
    try {
      const result = await checkMatchesForFoundReport(reportId);
      setMatches(await getMatchesForFoundReport(reportId));
      setNewCandidateCount(await countNewCandidatesForFoundReport(reportId));
      flashJustChecked();
      notifyVisualMatch(result.visualMatches);
    } finally {
      setChecking(false);
    }
  }

  async function handleReset() {
    const ok = await confirm(
      'לאפס את כל ההתאמות הקיימות עבור הדיווח הזה - כולל סטטוסים שנקבעו ידנית - ולסרוק הכל מחדש מיד?',
      { confirmLabel: 'איפוס וסריקה מחדש', danger: true }
    );
    if (!ok) return;
    setChecking(true);
    try {
      await clearMatchesForFoundReport(reportId);
      const result = await checkMatchesForFoundReport(reportId);
      setMatches(await getMatchesForFoundReport(reportId));
      setNewCandidateCount(await countNewCandidatesForFoundReport(reportId));
      flashJustChecked();
      notifyVisualMatch(result.visualMatches);
    } finally {
      setChecking(false);
    }
  }

  // Re-scores just this one pairing - useful right after editing that lost
  // case's details (from the same match card) to see the effect
  // immediately, without re-running the full check against every lost case
  // again.
  async function handleRecheckSingleMatch(lostCaseId) {
    setRecheckingId(lostCaseId);
    try {
      const result = await checkSingleMatch(lostCaseId, reportId);
      setMatches(await getMatchesForFoundReport(reportId));
      notifyVisualMatch(result.visualMatch ? [result.visualMatch] : []);
    } finally {
      setRecheckingId(null);
    }
  }

  async function handleMatchStatusChange(lostCaseId, status) {
    await updateMatchStatus(lostCaseId, reportId, status);
    setMatches((prev) => prev.map((m) => (m.lostCase.id === lostCaseId ? { ...m, status } : m)));
  }

  // Same reasoning as the lost-case page's handleMatchResolved - once a
  // match is confirmed via NotifyOwnerDialog's checkbox, both records are
  // already closed by the time this fires, so there's nothing left to do
  // on this page.
  function handleMatchResolved() {
    navigate('/');
  }

  // A lost case deleted from one of its match cards here (e.g. a bad
  // record that loaded wrong) is just gone - no need to reload the whole
  // page, its match simply drops out of the list.
  function handleLostCaseDeleted(lostCaseId) {
    setMatches((prev) => prev.filter((m) => m.lostCase.id !== lostCaseId));
  }

  // Quick rename from the pencil on the view header - saves just the
  // title, without needing to open full edit mode. Updates both report and
  // fields so a subsequent "עריכה" starts from the renamed value too.
  async function handleQuickRename(newTitle) {
    await updateFoundReport(reportId, { ...report, title: newTitle }, []);
    setReport((prev) => ({ ...prev, title: newTitle }));
    setFields((prev) => (prev ? { ...prev, title: newTitle } : prev));
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
      const result = await extractFromPhotos(files, '', report.species);
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
    await updateFoundReport(reportId, { ...fields, color: newColor }, []);
    setColorCheckPending(false);
    setEditing(false);
    await load();
  }

  async function handleColorCheckSkip() {
    setColorCheckPending(false);
    setEditing(false);
    await load();
  }

  if (!report) return <p className="p-4 text-slate-500">טוען...</p>;

  // A regular user can manage only what they reported; editors/admins can
  // manage everything. A ?edit=1 deep link (e.g. from a match card) still
  // only works for someone who's actually allowed to edit - anyone else
  // lands on the normal view instead.
  const canManage = isEditorOrAdmin || report.reportedByUid === user.uid;
  const showEditForm = editing && canManage;

  // Three groups the algorithm itself produces, plus a fourth (below) for
  // whatever a person has explicitly triaged by hand. "New" (candidates
  // never scored at all) isn't one of these - it has no card to show yet,
  // so it only ever appears as a count on the check button itself.
  const pendingReview = matches.filter((m) => m.status === REPORT_STATUS.NEW);
  const noMatch = matches.filter((m) => m.status === REPORT_STATUS.NO_MATCH || m.status === REPORT_STATUS.NO_MATCH_PHOTO);
  const processedMatches = matches.filter(
    (m) => m.status !== REPORT_STATUS.NEW && m.status !== REPORT_STATUS.NO_MATCH && m.status !== REPORT_STATUS.NO_MATCH_PHOTO
  );

  return (
    <div className="p-4">
      <BackLink onClick={handleBackToHome} onBack={handleBackInHistory}>
        לעמוד הראשי
      </BackLink>

      {!showEditForm ? (
        <>
          <MainPhoto photo={report.photos?.[0]} onView={setLightboxUrl} />
          <div className="mb-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <EditableTitle
                value={report.title}
                displayText={displayFoundReportName(report)}
                defaultDraft={shortSnippet(report.markings)}
                onSave={handleQuickRename}
              />
              <RecordStatusSelect
                status={report.status || RECORD_STATUS.ACTIVE}
                labels={FOUND_REPORT_STATUS_LABELS}
                onChange={handleRecordStatusChange}
              />
              {report.hasVisualMatch && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  🔎 AI זיהה דמיון חזותי
                </span>
              )}
            </div>
            <p className="mb-2 text-sm text-slate-500">
              {report.color} · {report.neighborhood} · {report.dateText}
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setShowDetails(true)} className="text-sm text-slate-600 underline">
                פרטים מלאים
              </button>
              {canManage && (
                <button onClick={() => setEditing(true)} className="text-sm text-slate-600 underline">
                  עריכה
                </button>
              )}
              {canManage && (
                <button onClick={handleDelete} disabled={deleting} className="text-sm text-red-600 underline disabled:opacity-50">
                  {deleting ? 'מוחקים...' : 'מחיקת הדיווח'}
                </button>
              )}
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
            {report.sourceUrl && (
              <a href={report.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                צפייה בפוסט המקורי
              </a>
            )}
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
          <FormSection title={labels.petDetailsSection}>
            <Field label={`${labels.nameLabel} (אם ידוע) / כותרת (כך יופיע הדיווח ברשימה)`}>
              <input className="input" value={fields.title || ''} onChange={(e) => setField('title', e.target.value)} />
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
            <Field label={labels.conditionLabel} inline>
              <SelectField
                className="w-full max-w-[9rem]"
                label={labels.conditionLabel}
                allowClear={false}
                value={fields.condition || 'seen_only'}
                onChange={(v) => setField('condition', v)}
                options={CAT_CONDITIONS}
              />
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
            {report.species === SPECIES.CAT && (
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
              <input type="checkbox" checked={!!fields.hasCollar} onChange={(e) => setField('hasCollar', e.target.checked)} />
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
            {report.species === SPECIES.DOG && (
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

      {!showEditForm && (
        <>
          <button
            onClick={handleCheckMatches}
            disabled={checking || newCandidateCount === 0}
            className={
              !checking && newCandidateCount === 0
                ? 'w-full rounded-xl bg-slate-100 px-4 py-3 font-medium text-slate-400'
                : 'w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white disabled:opacity-50'
            }
          >
            {checking
              ? 'סורקים התאמות...'
              : justChecked
                ? '✓ הסריקה הושלמה'
                : newCandidateCount > 0
                  ? `סריקת ${newCandidateCount} חדשים`
                  : 'אין חדשים לסריקה'}
          </button>
          {matches.length > 0 && (
            <button
              onClick={handleReset}
              disabled={checking}
              className="mb-6 mt-2 w-full text-center text-xs text-slate-400 underline disabled:opacity-50"
            >
              איפוס כל ההתאמות (כולל סטטוסים) וסריקה מחדש
            </button>
          )}
          {matches.length === 0 && <div className="mb-6" />}

          <h2 className="mb-3 text-lg font-semibold text-slate-700">תיקי חיפוש תואמים אפשריים ({matches.length})</h2>
          {matches.length > 0 && (
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              הכי טובה: <ConfidenceBadge score={matches[0].score} confidenceColors={confidenceColors} />
            </p>
          )}

          {matches.length === 0 ? (
            <p className="text-sm text-slate-400">
              {newCandidateCount > 0 ? 'לא בוצעה סריקה עדיין - לחצו למעלה כדי לסרוק.' : 'אין תיקי חיפוש במאגר להשוואה.'}
            </p>
          ) : (
            <>
              <h3 className="mb-2 text-sm font-semibold text-slate-600">ממתינות לבדיקה ({pendingReview.length})</h3>
              {pendingReview.length > 0 ? (
                <ul className="mb-6 space-y-3">
                  {pendingReview.map((m) => (
                    <ReverseMatchCard
                      key={m.lostCase.id}
                      match={m}
                      report={report}
                      onStatusChange={handleMatchStatusChange}
                      onViewPhoto={setLightboxUrl}
                      confidenceColors={confidenceColors}
                      onRecheck={handleRecheckSingleMatch}
                      rechecking={recheckingId === m.lostCase.id}
                      onResolved={handleMatchResolved}
                      onDeleted={handleLostCaseDeleted}
                      user={user}
                      isEditorOrAdmin={isEditorOrAdmin}
                    />
                  ))}
                </ul>
              ) : (
                <p className="mb-6 text-sm text-slate-400">אין התאמות ממתינות לבדיקה כרגע.</p>
              )}

              {noMatch.length > 0 && (
                <div className="mb-6">
                  <button onClick={() => setShowNoMatch((v) => !v)} className="mb-3 text-sm text-slate-500 underline">
                    {showNoMatch ? 'הסתרת' : 'הצגת'} {noMatch.length} ללא התאמה
                  </button>
                  {showNoMatch && (
                    <ul className="space-y-3">
                      {noMatch.map((m) => (
                        <ReverseMatchCard
                          key={m.lostCase.id}
                          match={m}
                          report={report}
                          onStatusChange={handleMatchStatusChange}
                          onViewPhoto={setLightboxUrl}
                          confidenceColors={confidenceColors}
                          onRecheck={handleRecheckSingleMatch}
                          rechecking={recheckingId === m.lostCase.id}
                          onResolved={handleMatchResolved}
                          onDeleted={handleLostCaseDeleted}
                          user={user}
                          isEditorOrAdmin={isEditorOrAdmin}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {processedMatches.length > 0 && (
                <div>
                  <button onClick={() => setShowProcessedMatches((v) => !v)} className="mb-3 text-sm text-slate-500 underline">
                    {showProcessedMatches ? 'הסתרת' : 'הצגת'} {processedMatches.length} התאמות שכבר טופלו
                  </button>
                  {showProcessedMatches && (
                    <ul className="space-y-3">
                      {processedMatches.map((m) => (
                        <ReverseMatchCard
                          key={m.lostCase.id}
                          match={m}
                          report={report}
                          onStatusChange={handleMatchStatusChange}
                          onViewPhoto={setLightboxUrl}
                          confidenceColors={confidenceColors}
                          onResolved={handleMatchResolved}
                          onDeleted={handleLostCaseDeleted}
                          user={user}
                          isEditorOrAdmin={isEditorOrAdmin}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {dialog}
      {visualMatchDialog}
      {colorCheckPending && (
        <ColorCheckDialog colorOptions={colorOptions} onSave={handleColorCheckSave} onSkip={handleColorCheckSkip} />
      )}
      {showDetails && (
        <RecordDetailsDialog
          title={displayFoundReportName(report)}
          onClose={() => setShowDetails(false)}
          photos={report.photos}
          onViewPhoto={setLightboxUrl}
          sections={buildFoundReportSections(report)}
        />
      )}
    </div>
  );
}

// The reverse of LostCaseDetail.jsx's MatchCard: here the found report is
// fixed (it's the page we're on) and the lost case is the varying side.
// Same underlying match record either way (see matchingApi.js), so this
// reuses the exact same status labels/colors and the same NotifyOwnerDialog
// - but with direction="toFinder", since here the person looking at this
// card is usually a stranger who found/saw an animal and doesn't yet know
// whose it might be. The message they'd send needs to be addressed to
// them and describe the LOST pet + its owner's contact info, not the other
// way around (see buildNotifyFinderMessage in notifyMessage.js).
function ReverseMatchCard({
  match,
  report,
  onStatusChange,
  onViewPhoto,
  confidenceColors,
  onRecheck,
  rechecking,
  onResolved,
  onDeleted,
  user,
  isEditorOrAdmin,
}) {
  const { lostCase } = match;
  const [showCaseDetails, setShowCaseDetails] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // A regular user can only delete a lost case they created themselves;
  // editors/admins can delete any of them - same rule LostCaseDetail.jsx
  // applies when deleting a case from its own page.
  const canManageLostCase = isEditorOrAdmin || lostCase.ownerId === user.uid;

  async function handleDelete() {
    const ok = await confirm(
      `למחוק את תיק החיפוש "${displayLostCaseName(lostCase)}" לצמיתות? כל הפרטים, התמונות וההתאמות שלו יימחקו ולא ניתן יהיה לשחזר אותם.`,
      { confirmLabel: 'מחיקת התיק' }
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteLostCase(lostCase.id, lostCase.photos || []);
      onDeleted?.(lostCase.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex shrink-0 items-center gap-2 font-medium text-slate-800">
          רמת התאמה: <ConfidenceBadge score={match.score} confidenceColors={confidenceColors} />
        </span>
        {onRecheck && (
          <button
            type="button"
            onClick={() => onRecheck(lostCase.id)}
            disabled={rechecking}
            className="shrink-0 whitespace-nowrap text-xs text-slate-500 underline disabled:opacity-50"
          >
            {rechecking ? 'סורק מחדש...' : 'סריקה חוזרת'}
          </button>
        )}
      </div>
      <div className="mb-2 flex justify-end">
        <DropdownBadge
          value={match.status}
          labels={MATCH_STATUS_LABELS}
          onChange={(status) => onStatusChange(lostCase.id, status)}
          colorClass={MATCH_STATUS_COLORS[match.status] || 'bg-slate-100 text-slate-600'}
        />
      </div>

      {lostCase.photos?.[0]?.url && (
        <button type="button" onClick={() => onViewPhoto(lostCase.photos[0].url)} className="mb-2 block w-full">
          <img
            src={lostCase.photos[0].url}
            alt=""
            className="h-48 w-full rounded-lg bg-slate-50 object-contain ring-4 ring-amber-400"
          />
        </button>
      )}

      <VisualSimilarityNote visualSimilarity={match.visualSimilarity} />

      <ul className="mb-2 list-inside list-disc text-sm text-slate-600">
        {match.reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>

      <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
        <p className="font-medium text-slate-700">{displayLostCaseName(lostCase)}</p>
        {lostCase.contactPhone && <p>טלפון: {lostCase.contactPhone}</p>}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setShowCaseDetails(true)}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600"
        >
          {petLabels(lostCase.species).petDetailsSection}
        </button>
        <Link
          to={`/lost/${lostCase.id}?edit=1`}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-center text-sm font-medium text-slate-600"
        >
          עריכה
        </Link>
        <Link
          to={`/lost/${lostCase.id}/analysis/${report.id}`}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-center text-sm font-medium text-slate-600"
        >
          ניתוח מלא
        </Link>
      </div>

      {canManageLostCase && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="mt-2 text-xs text-red-600 underline disabled:opacity-50"
        >
          {deleting ? 'מוחקים...' : 'מחיקת תיק החיפוש (רשומה שגויה)'}
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowNotify(true)}
        className="mt-2 w-full rounded-lg bg-emerald-50 py-2 text-sm font-medium text-emerald-700"
      >
        📱 יצירת קשר עם מי שמצא/ה בוואטסאפ
      </button>

      {showCaseDetails && (
        <RecordDetailsDialog
          title={displayLostCaseName(lostCase)}
          onClose={() => setShowCaseDetails(false)}
          photos={lostCase.photos}
          onViewPhoto={onViewPhoto}
          sections={buildLostCaseSections(lostCase)}
        />
      )}

      {showNotify && (
        <NotifyOwnerDialog
          lostCase={lostCase}
          report={report}
          foundReportId={report.id}
          direction="toFinder"
          onClose={() => setShowNotify(false)}
          onSent={() => onStatusChange(lostCase.id, REPORT_STATUS.CONTACTED)}
          onResolved={onResolved}
        />
      )}
      {confirmDialog}
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
