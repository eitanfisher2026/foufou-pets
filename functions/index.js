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
    petName: { type: ['string', 'null'] },
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
    mainPhotoRegion: {
      type: 'object',
      properties: {
        found: { type: 'boolean' },
        imageIndex: { type: ['integer', 'null'] },
        x: { type: ['number', 'null'] },
        y: { type: ['number', 'null'] },
        width: { type: ['number', 'null'] },
        height: { type: ['number', 'null'] },
      },
      required: ['found', 'imageIndex', 'x', 'y', 'width', 'height'],
      additionalProperties: false,
    },
  },
  required: [
    'species',
    'petName',
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
    'mainPhotoRegion',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You read screenshots of Facebook/WhatsApp posts about lost, found, or sighted pets, in Hebrew, Russian, English, or a mix, and extract structured facts. Follow these rules strictly:

- Never invent information. If a field is not visible or not stated, return null for it.
- "petName" is the animal's own name, if given - e.g. a flyer's title like "מאיה בואי הביתה" (Maya, come home) means the name is "מאיה". Only the animal's name, never a person's name.
- "sourceGroupName" is the Facebook/WhatsApp group or page name shown in the screenshot's header (not a person's name).
- Facebook posts are sometimes shown as "shared" from another group by one person, originally written by a different person. In that case, "originalPosterName" is whoever wrote the original post/caption, and "sharedByName" is the person who re-shared it into the group visible in the screenshot. If there is no sharing chain, leave "sharedByName" null and put the single visible author in "originalPosterName".
- "contactName"/"contactPhone" are only for a phone number explicitly given in the post text for contacting someone about the animal - not the poster's account name if no phone is given.
- "dateText" and "postAgeText" are the literal text shown (e.g. "21/5" or "19 שעות" or "3 days ago") - do not calculate or convert dates yourself.
- "captionText" is the post's own written text, concatenated across all provided screenshots of the same post, in its original language.
- If multiple screenshots are provided, treat them as one single post/report and merge what you find from each into one set of fields.
- "mainPhotoRegion" locates the single clearest, most complete photo of the actual animal within the provided images, so it can be cropped out and used as the record's main photo. Treat each image as spanning from (0,0) at its top-left corner to (1,1) at its bottom-right corner. "imageIndex" is the 0-based position of the image (in the order the images were given) that contains this photo. "x" and "y" are the fractional coordinates of the region's top-left corner; "width" and "height" are its fractional size. Pick the tightest box around just the animal's photo - excluding the post's text, logos, decorative frames, other people, and unrelated icons. If the screenshot shows several photos of the animal (e.g. a collage), pick the largest and clearest one. If no clear photo of the animal is visible in any image (e.g. a text-only post), set "found" to false and leave the other fields null.`;

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
      max_tokens: 4096,
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
    if (response.stop_reason === 'max_tokens') {
      throw new HttpsError('resource-exhausted', 'The extracted text was too long to complete.');
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      throw new HttpsError('internal', 'No extraction result returned.');
    }

    try {
      return JSON.parse(textBlock.text);
    } catch {
      throw new HttpsError('internal', 'Could not parse the extraction result.');
    }
  }
);
