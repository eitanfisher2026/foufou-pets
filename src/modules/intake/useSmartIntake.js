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
 */
export function useSmartIntake() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reading, error: readError, read, cancel: cancelReading } = useScreenshotReader();
  const [files, setFiles] = useState([]);
  const [extracted, setExtracted] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleFiles(newFiles, postText = '') {
    if (newFiles.length === 0) return;
    setFiles(newFiles);
    setExtracted(null);

    try {
      const result = await read(newFiles, postText);
      setExtracted(result);
      if (result.reportType === 'lost' || result.reportType === 'found') {
        await createFromType(result, result.reportType, newFiles);
      }
    } catch {
      // error already surfaced via readError
    }
  }

  async function createFromType(result, type, uploadedFiles) {
    setCreating(true);
    try {
      const mainPhoto = await extractMainPhoto(uploadedFiles, result.mainPhotoRegion);
      const photos = mainPhoto ? [mainPhoto, ...uploadedFiles] : uploadedFiles;

      if (type === 'lost') {
        const fields = mergeExtractedLostFields(result);
        const caseId = await createLostCase({ ...fields, source: 'screenshot' }, photos, user.uid);
        navigate(`/lost/${caseId}`);
      } else {
        const fields = mergeExtractedFoundFields(result);
        const reportId = await createFoundReport({ ...fields, source: 'screenshot' }, photos, user.uid);
        navigate(`/found/${reportId}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return {
    files,
    extracted,
    reading,
    creating,
    busy: reading || creating,
    readError,
    handleFiles,
    createFromType,
    cancelReading,
  };
}
