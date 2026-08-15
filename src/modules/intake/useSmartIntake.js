import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import { detectSpecies } from '../screenshot-ingestion/readScreenshots.js';
import { extractMainPhoto } from '../shared/cropPhoto.js';
import { findDuplicates } from '../shared/duplicateCheckApi.js';
import { getColorOptions } from '../shared/colorOptionsApi.js';
import { getBreedOptions } from '../shared/breedOptionsApi.js';
import { SPECIES, DEFAULT_DOG_BREED } from '../shared/collections.js';
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
 *
 * Unlike the dedicated lost/found forms (which already know species from
 * the dashboard's fixed mode) or a re-scan on an existing record (which
 * already knows it from the record itself), this flow genuinely doesn't
 * know cat-or-dog up front - that's the one thing a quick, cheap
 * detectSpecies() call resolves before the real extraction call can even
 * pick which of its two schemas to use.
 */
export function useSmartIntake() {
  const { user, preferredSpecies } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read, cancel: cancelReading } = useScreenshotReader();
  const [detectingSpecies, setDetectingSpecies] = useState(false);
  const [files, setFiles] = useState([]);
  const [extracted, setExtracted] = useState(null);
  // Resolved once per analyze() call, alongside `extracted` - kept apart so
  // the lost/found fallback buttons (which call createFromType() again on
  // click, without re-running detection) still know what species this
  // extraction was actually run against.
  const [detectedSpecies, setDetectedSpecies] = useState(null);
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
  // Non-blocking post-creation nudges (see BreedCheckDialog.jsx/
  // ColorCheckDialog.jsx) - both hold what's needed to save a better
  // value or just navigate on, since the record itself is already saved by
  // the time either is set. Breed is checked first (dog-only): if it also
  // needs a color check, that runs right after the breed dialog resolves.
  const [breedCheck, setBreedCheck] = useState(null);
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
      setDetectingSpecies(true);
      let resolvedSpecies = SPECIES.CAT;
      let detectCostUsd = 0;
      try {
        const speciesResult = await detectSpecies(targetFiles[0]);
        if (speciesResult.species === SPECIES.CAT || speciesResult.species === SPECIES.DOG) {
          resolvedSpecies = speciesResult.species;
        }
        detectCostUsd = speciesResult._aiUsage?.estimatedCostUsd || 0;
      } finally {
        setDetectingSpecies(false);
      }
      setDetectedSpecies(resolvedSpecies);

      const result = await read(targetFiles, postText, resolvedSpecies);
      result._aiUsage = { ...result._aiUsage, estimatedCostUsd: (result._aiUsage?.estimatedCostUsd || 0) + detectCostUsd };
      setExtracted(result);
      if (result.reportType === 'lost' || result.reportType === 'found') {
        await createFromType(result, result.reportType, targetFiles, sourceUrlOverride, resolvedSpecies);
      }
    } catch {
      // error already surfaced via readError
    }
  }

  async function createFromType(result, type, uploadedFiles, sourceUrlOverride, speciesOverride) {
    const species = speciesOverride ?? detectedSpecies ?? preferredSpecies;
    const finalSourceUrl = sourceUrlOverride ?? sourceUrl;
    if (finalSourceUrl?.trim() || result.contactPhone?.trim()) {
      const matches = await findDuplicates(type, { sourceUrl: finalSourceUrl, contactPhone: result.contactPhone });
      if (matches.length > 0) {
        pendingCreateRef.current = { result, type, uploadedFiles, sourceUrlOverride, species };
        setDuplicateRecordType(type);
        setDuplicateMatches(matches);
        return;
      }
    }
    await doCreate(result, type, uploadedFiles, sourceUrlOverride, species);
  }

  async function doCreate(result, type, uploadedFiles, sourceUrlOverride, species) {
    setCreating(true);
    try {
      const mainPhoto = await extractMainPhoto(uploadedFiles, result.mainPhotoRegion);
      const photos = mainPhoto ? [mainPhoto, ...uploadedFiles] : uploadedFiles;
      const finalSourceUrl = sourceUrlOverride ?? sourceUrl;

      if (type === 'lost') {
        const fields = mergeExtractedLostFields(result, { ...EMPTY_LOST_FIELDS, species });
        const finalFields = { ...fields, source: 'screenshot', sourceUrl: finalSourceUrl };
        const caseId = await createLostCase(finalFields, photos, user);
        await runPostCreateChecks('lost', caseId, finalFields);
      } else {
        const fields = mergeExtractedFoundFields(result, { ...EMPTY_FOUND_FIELDS, species });
        const finalFields = { ...fields, source: 'screenshot', sourceUrl: finalSourceUrl };
        const reportId = await createFoundReport(finalFields, photos, user);
        await runPostCreateChecks('found', reportId, finalFields);
      }
    } finally {
      setCreating(false);
    }
  }

  // Runs right after a record is created from an AI extraction - breed
  // first (dog-only, since the overwhelming majority of cat reports are
  // genuinely mixed/street cats with nothing to double-check), then color,
  // then navigates once neither nudge is needed. Neither check blocks
  // anything: the record is already saved either way.
  async function runPostCreateChecks(type, id, fields) {
    const isUnidentifiedDogBreed = fields.species === SPECIES.DOG && (!fields.breed || fields.breed === DEFAULT_DOG_BREED);
    if (isUnidentifiedDogBreed) {
      setBreedCheck({ type, id, fields, breedOptions: await getBreedOptions(SPECIES.DOG) });
      return;
    }
    await maybeColorCheck(type, id, fields);
  }

  async function maybeColorCheck(type, id, fields) {
    if (fields.color === 'אחר') {
      setColorCheck({ type, id, fields, colorOptions: await getColorOptions(fields.species) });
    } else {
      navigate(type === 'lost' ? `/lost/${id}` : `/found/${id}`);
    }
  }

  async function saveBreedCheck(newBreed) {
    const { type, id, fields } = breedCheck;
    const updatedFields = { ...fields, breed: newBreed };
    if (type === 'lost') {
      await updateLostCase(id, updatedFields, []);
    } else {
      await updateFoundReport(id, updatedFields, []);
    }
    setBreedCheck(null);
    await maybeColorCheck(type, id, updatedFields);
  }

  async function skipBreedCheck() {
    const { type, id, fields } = breedCheck;
    setBreedCheck(null);
    await maybeColorCheck(type, id, fields);
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
    if (pending) doCreate(pending.result, pending.type, pending.uploadedFiles, pending.sourceUrlOverride, pending.species);
  }

  function cancelDuplicateCreate() {
    setDuplicateMatches(null);
    pendingCreateRef.current = null;
  }

  return {
    files,
    setFiles,
    extracted,
    detectedSpecies,
    reading,
    creating,
    busy: reading || creating || detectingSpecies,
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
    breedCheck,
    saveBreedCheck,
    skipBreedCheck,
    colorCheck,
    saveColorCheck,
    skipColorCheck,
  };
}
