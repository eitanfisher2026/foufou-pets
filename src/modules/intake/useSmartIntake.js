import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import { extractMainPhoto } from '../shared/cropPhoto.js';
import { findDuplicatesBySourceUrl } from '../shared/duplicateCheckApi.js';
import { getColorOptions } from '../shared/colorOptionsApi.js';
import { createLostCase, updateLostCase } from '../lost-report/lostReportApi.js';
import { mergeExtractedLostFields, EMPTY_LOST_FIELDS } from '../lost-report/lostFieldMapping.js';
import { createFoundReport, updateFoundReport } from '../found-report/foundReportApi.js';
import { mergeExtractedFoundFields, EMPTY_FOUND_FIELDS } from '../found-report/foundFieldMapping.js';

/**
 * The "classify lost vs. found from images, then create the record" flow
 * used by both the manual smart-intake upload button and the share-target
 * screen (photos shared in from Facebook) - one place owns this so the two
 * entry points can't drift apart.
 *
 * `analyze()` is a separate, explicit step from collecting files - adding a
 * photo (by picking or pasting) never triggers it by itself, so someone can
 * paste a screenshot, then paste the post's link text, then add another
 * screenshot, and only then run one extraction over everything they've
 * collected - instead of the first paste kicking off (and creating a
 * record from) a still-incomplete set.
 */
export function useSmartIntake() {
  const { user, preferredSpecies } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read, cancel: cancelReading } = useScreenshotReader();
  const [files, setFiles] = useState([]);
  const [extracted, setExtracted] = useState(null);
  const [creating, setCreating] = useState(false);
  // Set by a caller that pulled/pasted a Facebook link (see facebookLink.js)
  // - carried through to whichever record ends up created, so it's not
  // AI-extracted and has nowhere else to live until then.
  const [sourceUrl, setSourceUrl] = useState('');
  // Duplicate-source-url warning (see duplicateCheckApi.js) - the pending
  // create args are stashed in a ref (not state) so "continue anyway" can
  // resume the exact same creation call without re-running extraction.
  const [duplicateMatches, setDuplicateMatches] = useState(null);
  const [duplicateRecordType, setDuplicateRecordType] = useState(null);
  const pendingCreateRef = useRef(null);
  // Non-blocking post-creation nudge when color came out as "אחר" (see
  // ColorCheckDialog.jsx) - holds what's needed to save a better color or
  // just navigate on, since the record itself is already saved by the time
  // this is set.
  const [colorCheck, setColorCheck] = useState(null);

  // `filesOverride`/`sourceUrlOverride` let a caller that just set that
  // state itself (e.g. the share-target screen, reacting to a fresh share
  // within the same synchronous handler) pass the values directly instead
  // of relying on state having already re-rendered.
  async function analyze(postText = '', filesOverride, sourceUrlOverride) {
    const targetFiles = filesOverride ?? files;
    if (targetFiles.length === 0) return;
    setExtracted(null);

    try {
      const result = await read(targetFiles, postText);
      setExtracted(result);
      if (result.reportType === 'lost' || result.reportType === 'found') {
        await createFromType(result, result.reportType, targetFiles, sourceUrlOverride);
      }
    } catch {
      // error already surfaced via readError
    }
  }

  async function createFromType(result, type, uploadedFiles, sourceUrlOverride) {
    const finalSourceUrl = sourceUrlOverride ?? sourceUrl;
    if (finalSourceUrl?.trim()) {
      const matches = await findDuplicatesBySourceUrl(type, finalSourceUrl);
      if (matches.length > 0) {
        pendingCreateRef.current = { result, type, uploadedFiles, sourceUrlOverride };
        setDuplicateRecordType(type);
        setDuplicateMatches(matches);
        return;
      }
    }
    await doCreate(result, type, uploadedFiles, sourceUrlOverride);
  }

  async function doCreate(result, type, uploadedFiles, sourceUrlOverride) {
    setCreating(true);
    try {
      const mainPhoto = await extractMainPhoto(uploadedFiles, result.mainPhotoRegion);
      const photos = mainPhoto ? [mainPhoto, ...uploadedFiles] : uploadedFiles;
      const finalSourceUrl = sourceUrlOverride ?? sourceUrl;

      // A confident species read from the screenshot itself always wins
      // (this flow is exactly for the case of not knowing in advance what
      // someone's about to share - a cat post should never end up filed as
      // a dog just because that's this person's current toggle). Only
      // falls back to the currently-active species when the AI genuinely
      // couldn't tell.
      if (type === 'lost') {
        const fields = mergeExtractedLostFields(result, { ...EMPTY_LOST_FIELDS, species: preferredSpecies });
        const finalFields = { ...fields, source: 'screenshot', sourceUrl: finalSourceUrl };
        const caseId = await createLostCase(finalFields, photos, user);
        if (finalFields.color === 'אחר') {
          setColorCheck({ type: 'lost', id: caseId, fields: finalFields, colorOptions: await getColorOptions(fields.species) });
        } else {
          navigate(`/lost/${caseId}`);
        }
      } else {
        const fields = mergeExtractedFoundFields(result, { ...EMPTY_FOUND_FIELDS, species: preferredSpecies });
        const finalFields = { ...fields, source: 'screenshot', sourceUrl: finalSourceUrl };
        const reportId = await createFoundReport(finalFields, photos, user);
        if (finalFields.color === 'אחר') {
          setColorCheck({ type: 'found', id: reportId, fields: finalFields, colorOptions: await getColorOptions(fields.species) });
        } else {
          navigate(`/found/${reportId}`);
        }
      }
    } finally {
      setCreating(false);
    }
  }

  async function saveColorCheck(newColor) {
    const { type, id, fields } = colorCheck;
    if (type === 'lost') {
      await updateLostCase(id, { ...fields, color: newColor }, []);
      navigate(`/lost/${id}`);
    } else {
      await updateFoundReport(id, { ...fields, color: newColor }, []);
      navigate(`/found/${id}`);
    }
    setColorCheck(null);
  }

  function skipColorCheck() {
    const { type, id } = colorCheck;
    navigate(type === 'lost' ? `/lost/${id}` : `/found/${id}`);
    setColorCheck(null);
  }

  function continueCreateAnyway() {
    const pending = pendingCreateRef.current;
    setDuplicateMatches(null);
    if (pending) doCreate(pending.result, pending.type, pending.uploadedFiles, pending.sourceUrlOverride);
  }

  function cancelDuplicateCreate() {
    setDuplicateMatches(null);
    pendingCreateRef.current = null;
  }

  return {
    files,
    setFiles,
    extracted,
    reading,
    creating,
    busy: reading || creating,
    readError,
    analyze,
    createFromType,
    cancelReading,
    sourceUrl,
    setSourceUrl,
    duplicateMatches,
    duplicateRecordType,
    continueCreateAnyway,
    cancelDuplicateCreate,
    colorCheck,
    saveColorCheck,
    skipColorCheck,
  };
}
