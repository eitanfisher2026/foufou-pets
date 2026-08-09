import { onCall, HttpsError } from 'firebase-functions/v2/https';
import Anthropic from '@anthropic-ai/sdk';

// Sonnet, not Opus: this is a bounded structured-extraction task (read a
// screenshot, fill a form), not open-ended reasoning - Sonnet's accuracy on
// multilingual OCR-plus-judgment is comfortably enough for this, at roughly
// a fifth of Opus's per-call cost. Runs once per uploaded report, never at
// match time, so this is the only AI spend in the whole app.
const MODEL = 'claude-sonnet-5';

// Must match CAT_COLORS/COLLAR_COLORS in src/modules/shared/collections.js -
// the functions package doesn't share modules with the client, so these are
// kept in sync by hand.
const CAT_COLORS = ['לבן', 'שחור', 'אפור', 'כתום/ג׳ינג׳י', 'חום', 'טאבי (מנומר)', 'תלת-גוני (קליקו)', 'שחור-לבן', 'אחר'];
const COLLAR_COLORS = ['אדום', 'כחול', 'ורוד', 'שחור', 'לבן', 'צהוב', 'ירוק', 'כתום', 'סגול', 'צבעוני/כמה צבעים', 'אחר'];

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
    color: { type: 'string', enum: CAT_COLORS },
    colorDescription: { type: 'string' },
    // anyOf, not type:['string','null']+enum - Anthropic rejects an enum
    // combined with an array-form type ("Enum value 'small' does not match
    // declared type '['string', 'null']'").
    size: { anyOf: [{ type: 'string', enum: ['small', 'medium', 'large'] }, { type: 'null' }] },
    ageClass: { anyOf: [{ type: 'string', enum: ['kitten', 'adult'] }, { type: 'null' }] },
    markings: { type: 'string' },
    hasCollar: { type: ['boolean', 'null'] },
    collarColor: { anyOf: [{ type: 'string', enum: COLLAR_COLORS }, { type: 'null' }] },
    collarHasBell: { type: ['boolean', 'null'] },
    hasClippedEar: { type: ['boolean', 'null'] },
    city: { type: 'string' },
    neighborhood: { type: 'string' },
    location: { type: 'string' },
    dateText: { type: 'string' },
    computedDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
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
    'color',
    'colorDescription',
    'size',
    'ageClass',
    'markings',
    'hasCollar',
    'collarColor',
    'collarHasBell',
    'hasClippedEar',
    'city',
    'neighborhood',
    'location',
    'dateText',
    'computedDate',
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
- "color" is your best classification into exactly one of the given Hebrew options, based on what's visible in the photos - pick the closest match even if the coat is patterned or multi-colored, and use "אחר" only if truly none of the other options fit. "colorDescription" is separate: the fuller free-text description (patterns, patches, markings related to color) in whatever language the post/your description is in - it can and should contain more detail than "color" does.
- "size" is your best guess at the animal's physical size (small, medium, or large) from the photos, or null if no photo gives any real basis to judge.
- "ageClass" is separate from size - "kitten" only if the animal is clearly a young kitten, "adult" otherwise, or null if unclear. A small adult cat is "adult", not "kitten".
- "collarColor" is the color of the collar/harness itself (only meaningful if hasCollar is true) - one of the given options, or null if there's no visible collar or its color can't be told. "collarHasBell" is whether a bell is visibly hanging from the collar - true/false only when the collar is clearly visible enough to tell, null otherwise (same reasoning as hasCollar).
- "hasClippedEar" is whether the animal has a clipped/notched ear tip (usually the left ear) - the standard visual marking left after a street cat is trap-neuter-released (TNR), a small flat cut or V-notch at the very tip of one ear, distinct from an injury. true only if this specific marking is visible, false if an ear is clearly visible and clearly NOT clipped, null if ears aren't visible clearly enough to tell either way. This is worth looking for carefully - it's one of the most reliable identifying marks for a street cat, and easy to miss if you're not specifically checking the ear tips.
- "markings" lists distinct identifying marks, one per line (use \\n between them) - do not write one flowing sentence combining them. E.g. two lines "נקודה שחורה ליד האף" and "אוזניים קצרות מהרגיל", not one sentence joining both. Each line should be a single specific, visually-checkable feature: a spot, a scar, an asymmetry, a missing limb, or a color patch at a specific location (e.g. "כתמים בגוון קרם באוזניים ובזנב"). A generic, whole-coat description ("white cat", "mostly gray with some white") belongs only in colorDescription, not here - but if colorDescription itself calls out where on the body a patch or pattern appears, restate that as its own line in markings too, since a located patch is just as identifying as a scar or notch and markings is what actually gets compared during matching (colorDescription is for display only). Leave "" if nothing distinctive beyond generic coloring is visible or mentioned.
- "city" and "neighborhood" split out of the post's location text where possible (e.g. "רמת גן, ליד הפארק" -> city "רמת גן", neighborhood/area "" or a more specific area if named). Leave neighborhood "" if the post only names a city, or if you can't confidently separate the two.
- "sourceGroupName" is the Facebook/WhatsApp group or page name shown in the screenshot's header (not a person's name).
- Facebook posts are sometimes shown as "shared" from another group by one person, originally written by a different person. In that case, "originalPosterName" is whoever wrote the original post/caption, and "sharedByName" is the person who re-shared it into the group visible in the screenshot. If there is no sharing chain, leave "sharedByName" as "" and put the single visible author in "originalPosterName".
- "contactName"/"contactPhone" are only for a phone number explicitly given in the post text for contacting someone about the animal - not the poster's account name if no phone is given.
- "dateText" and "postAgeText" are the literal text shown (e.g. "21/5" or "19 שעות" or "3 days ago") - copy them as written, do not convert them here.
- "computedDate" is a real calendar date, YYYY-MM-DD, for when the animal was actually lost/found/seen. The user message tells you today's date - use it as your only reference point:
  - If dateText clearly states when the animal was seen/lost (a specific date, or a relative duration like "3 days ago"), use that as the primary source.
  - Many posts never say anything about the sighting itself - only the caption's own topic ("who lost this cat?") plus the surrounding social-media UI's own post-age indicator (the small text next to the poster's name/timestamp, e.g. "1 ימים" / "19 hours ago" - that's what postAgeText captures). When dateText is empty or too vague to convert but postAgeText gives a specific duration, use postAgeText instead: a "have you seen this cat" post is normally made close to when the animal was actually seen, even if not identical to the minute.
  - A date written as DD/MM with no year (Israeli convention, day before month - "21/5" is May 21st) belongs to the current year unless that would place it in the future, in which case use the previous year instead - a lost/found post is never dated after today.
  - A relative duration ("3 days ago", "19 שעות", "לפני שבוע", "1 ימים") converts to today's date minus that duration.
  - If neither field gives you a specific, computable duration or date - a holiday name, "a while ago", or nothing at all - leave this null rather than guessing. A missing date is fine; a wrong one actively hurts matching.
- "captionText" is the post's own written text, concatenated across all provided screenshots of the same post, in its original language.
- If multiple screenshots are provided, treat them as one single post/report and merge what you find from each into one set of fields.
- "mainPhotoRegion" locates the single clearest, most complete photo of the actual animal within the provided images, so it can be cropped out and used as the record's main photo. Getting this box right matters a lot - a bad box (cutting off the animal, or including surrounding text/background) is worse than not finding one at all, so be careful and conservative:
  - Treat each image as spanning from (0,0) at its top-left corner to (1,1) at its bottom-right corner. "imageIndex" is the 0-based position of the image (in the order the images were given) that contains this photo. "x" and "y" are the fractional coordinates of the region's top-left corner; "width" and "height" are its fractional size.
  - The box must contain the animal's *entire* body as shown in the photo (head to tail/paws) - never a box that only shows part of the animal, like just legs or just a face when more of the body is visible in the source photo.
  - The box should always be a tight crop around just the animal itself, not the whole photo it appears in - this applies in every case, not only designed flyers:
    - Many posts are designed flyers where a rectangular photo is placed inside a colored background with a caption printed above, below, or beside it. There, exclude the flyer background and caption entirely - crop to the inset photo's edge, then continue tightening to just the animal within it.
    - Plain candid photos (e.g. a phone photo of a cat on the street, with pavement, bins, plants, or other clutter around it) need the same tight treatment - do not treat "the whole photo" as the answer just because there's no flyer graphic around it. Draw the box around the animal's body itself, excluding as much of the surrounding scenery as you can while still keeping the whole animal in frame.
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

    // Computed fresh per request, not baked into the static system prompt -
    // a warm function instance can stay alive for hours/days between cold
    // starts, so "today" has to come from the request, not module load time.
    const todayIso = new Date().toISOString().slice(0, 10);

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
            { type: 'text', text: `Today's date is ${todayIso}. Extract the fields from this post.` },
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
      const parsed = JSON.parse(textBlock.text);
      // Cheap to log, useful when a main-photo crop comes out wrong - lets
      // us check what box the model actually returned without guessing.
      console.log('mainPhotoRegion:', JSON.stringify(parsed.mainPhotoRegion));
      return parsed;
    } catch {
      throw new HttpsError('internal', 'Could not parse the extraction result.');
    }
  }
);
