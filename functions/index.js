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
    // Text fields use "" as the not-found sentinel rather than null: Anthropic
    // caps schemas at 16 nullable/union-typed parameters, and the client
    // already treats "" the same as null via `||` fallbacks, so there's no
    // need to spend the union-type budget on every text field. hasCollar
    // keeps real tri-state (true/false/null=unknown) since collapsing
    // "unknown" into false would misreport a case as collarless.
    petName: { type: 'string' },
    colorDescription: { type: 'string' },
    markings: { type: 'string' },
    hasCollar: { type: ['boolean', 'null'] },
    location: { type: 'string' },
    dateText: { type: 'string' },
    contactName: { type: 'string' },
    contactPhone: { type: 'string' },
    captionText: { type: 'string' },
    sourceGroupName: { type: 'string' },
    originalPosterName: { type: 'string' },
    sharedByName: { type: 'string' },
    postAgeText: { type: 'string' },
    mainPhotoRegion: {
      type: 'object',
      properties: {
        found: { type: 'boolean' },
        // 0 is the placeholder value when found is false; the client never
        // reads these unless found is true, so they don't need to be nullable.
        imageIndex: { type: 'integer' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
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

- Never invent information. If a text field is not visible or not stated, return an empty string "" for it (not null). For "hasCollar", use null specifically to mean not stated/unclear - true and false are only for when the post clearly shows or says so.
- "petName" is the animal's own name, if given - e.g. a flyer's title like "מאיה בואי הביתה" (Maya, come home) means the name is "מאיה". Only the animal's name, never a person's name.
- "sourceGroupName" is the Facebook/WhatsApp group or page name shown in the screenshot's header (not a person's name).
- Facebook posts are sometimes shown as "shared" from another group by one person, originally written by a different person. In that case, "originalPosterName" is whoever wrote the original post/caption, and "sharedByName" is the person who re-shared it into the group visible in the screenshot. If there is no sharing chain, leave "sharedByName" as "" and put the single visible author in "originalPosterName".
- "contactName"/"contactPhone" are only for a phone number explicitly given in the post text for contacting someone about the animal - not the poster's account name if no phone is given.
- "dateText" and "postAgeText" are the literal text shown (e.g. "21/5" or "19 שעות" or "3 days ago") - do not calculate or convert dates yourself.
- "captionText" is the post's own written text, concatenated across all provided screenshots of the same post, in its original language.
- If multiple screenshots are provided, treat them as one single post/report and merge what you find from each into one set of fields.
- "mainPhotoRegion" locates the single clearest, most complete photo of the actual animal within the provided images, so it can be cropped out and used as the record's main photo. Getting this box right matters a lot - a bad box (cutting off the animal, or including surrounding text/background) is worse than not finding one at all, so be careful and conservative:
  - Treat each image as spanning from (0,0) at its top-left corner to (1,1) at its bottom-right corner. "imageIndex" is the 0-based position of the image (in the order the images were given) that contains this photo. "x" and "y" are the fractional coordinates of the region's top-left corner; "width" and "height" are its fractional size.
  - The box must contain the animal's *entire* body as shown in the photo (head to tail/paws) - never a box that only shows part of the animal, like just legs or just a face when more of the body is visible in the source photo.
  - Many posts are designed flyers where a rectangular photo is placed inside a colored background with a caption printed above, below, or beside it. In that case, the box is exactly the photo's own rectangle - stop at the photo's edge. Do not extend the box into the surrounding flyer background or caption text even slightly, and do not shrink it to less than the full photo either.
  - If you are not confident you can draw an accurate box - for example the photo is small, at an angle, partly obscured, or its edges are unclear - set "found" to false rather than guessing. A missing main photo is a minor inconvenience; a wrong one is misleading.
  - If the screenshot shows several separate photos of the animal (e.g. a collage), pick the largest and clearest single one - do not draw one box spanning multiple photos.
  - If no clear photo of the animal is visible in any image (e.g. a text-only post), set "found" to false and set imageIndex/x/y/width/height to 0 - they will be ignored.`;

export const extractReportFromImages = onCall(
  // Default timeout (60s) was getting hit mid-request once mainPhotoRegion
  // reasoning + a 4096 max_tokens budget pushed real-world latency past it -
  // Cloud Run kills the request before the handler can return an error, which
  // the browser sees as a bare CORS failure instead of a real error message.
  { region: 'europe-west1', cors: true, secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 120 },
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
