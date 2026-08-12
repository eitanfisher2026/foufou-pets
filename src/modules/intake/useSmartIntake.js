import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useScreenshotReader } from '../shared/useScreenshotReader.js';
import { extractMainPhoto } from '../shared/cropPhoto.js';
import { createLostCase } from '../lost-report/lostReportApi.js';
import { mergeExtractedLostFields } from '../lost-report/lostFieldMapping.js';
import { createFoundReport } from '../found-report/foundReportApi.js';
import { mergeExtractedFoundFields } from '../found-report/foundFieldMapping.js';

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read, cancel: cancelReading } = useScreenshotReader();
  const [files, setFiles] = useState([]);
  const [extracted, setExtracted] = useState(null);
  const [creating, setCreating] = useState(false);
  // Set by a caller that pulled/pasted a Facebook link (see facebookLink.js)
  // - carried through to whichever record ends up created, so it's not
  // AI-extracted and has nowhere else to live until then.
  const [sourceUrl, setSourceUrl] = useState('');

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
    setCreating(true);
    try {
      const mainPhoto = await extractMainPhoto(uploadedFiles, result.mainPhotoRegion);
      const photos = mainPhoto ? [mainPhoto, ...uploadedFiles] : uploadedFiles;
      const finalSourceUrl = sourceUrlOverride ?? sourceUrl;

      if (type === 'lost') {
        const fields = mergeExtractedLostFields(result);
        const caseId = await createLostCase({ ...fields, source: 'screenshot', sourceUrl: finalSourceUrl }, photos, user.uid);
        navigate(`/lost/${caseId}`);
      } else {
        const fields = mergeExtractedFoundFields(result);
        const reportId = await createFoundReport(
          { ...fields, source: 'screenshot', sourceUrl: finalSourceUrl },
          photos,
          user.uid
        );
        navigate(`/found/${reportId}`);
      }
    } finally {
      setCreating(false);
    }
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
  };
}
