import { onCall, HttpsError } from 'firebase-functions/v2/https';
import Anthropic from '@anthropic-ai/sdk';

// Sonnet, not Opus: this is a bounded structured-extraction task (read a
// screenshot, fill a form), not open-ended reasoning - Sonnet's accuracy on
// multilingual OCR-plus-judgment is comfortably enough for this, at roughly
// a fifth of Opus's per-call cost. Runs once per uploaded report, never at
// match time, so this is the only AI spend in the whole app.
const MODEL = 'claude-sonnet-5';

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    species: { type: 'string', enum: ['cat', 'dog', 'other', 'unknown'] },
    colorDescription: { type: ['string', 'null'] },
    markings: { type: ['string', 'null'] },
    hasCollar: { type: ['boolean', 'null'] },
    location: { type: ['string', 'null'] },
    dateText: { type: ['string', 'null'] },
    contactName: { type: ['string', 'null'] },
    contactPhone: { type: ['string', 'null'] },
    captionText: { type: ['string', 'null'] },
    sourceGroupName: { type: ['string', 'null'] },
    originalPosterName: { type: ['string', 'null'] },
    sharedByName: { type: ['string', 'null'] },
    postAgeText: { type: ['string', 'null'] },
  },
  required: [
    'species',
    'colorDescription',
    'markings',
    'hasCollar',
    'location',
    'dateText',
    'contactName',
    'contactPhone',
    'captionText',
    'sourceGroupName',
    'originalPosterName',
    'sharedByName',
    'postAgeText',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You read screenshots of Facebook/WhatsApp posts about lost, found, or sighted pets, in Hebrew, Russian, English, or a mix, and extract structured facts. Follow these rules strictly:

- Never invent information. If a field is not visible or not stated, return null for it.
- "sourceGroupName" is the Facebook/WhatsApp group or page name shown in the screenshot's header (not a person's name).
- Facebook posts are sometimes shown as "shared" from another group by one person, originally written by a different person. In that case, "originalPosterName" is whoever wrote the original post/caption, and "sharedByName" is the person who re-shared it into the group visible in the screenshot. If there is no sharing chain, leave "sharedByName" null and put the single visible author in "originalPosterName".
- "contactName"/"contactPhone" are only for a phone number explicitly given in the post text for contacting someone about the animal - not the poster's account name if no phone is given.
- "dateText" and "postAgeText" are the literal text shown (e.g. "21/5" or "19 שעות" or "3 days ago") - do not calculate or convert dates yourself.
- "captionText" is the post's own written text, concatenated across all provided screenshots of the same post, in its original language.
- If multiple screenshots are provided, treat them as one single post/report and merge what you find from each into one set of fields.`;

export const extractReportFromImages = onCall(
  { region: 'europe-west1', cors: true, secrets: ['ANTHROPIC_API_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const images = request.data?.images;
    if (!Array.isArray(images) || images.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one image is required.');
    }
    if (images.length > 6) {
      throw new HttpsError('invalid-argument', 'Too many images in one request.');
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const imageBlocks = images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType || 'image/jpeg', data: img.base64 },
    }));

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: 'Extract the fields from this post.' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new HttpsError('aborted', 'The image could not be processed.');
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      throw new HttpsError('internal', 'No extraction result returned.');
    }

    return JSON.parse(textBlock.text);
  }
);
