import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';

initializeApp();

// Sonnet, not Opus: this is a bounded structured-extraction task (read a
// screenshot, fill a form), not open-ended reasoning - Sonnet's accuracy on
// multilingual OCR-plus-judgment is comfortably enough for this, at roughly
// a fifth of Opus's per-call cost. Runs once per uploaded report, never at
// match time - see comparePhotoSimilarity below for the one call that does
// run at match time, deliberately gated to a small minority of pairs to
// keep that exception cheap.
const MODEL = 'claude-sonnet-5';

// Claude Sonnet 5 list pricing, per million tokens. Intro pricing is in
// effect through 2026-08-31 ($2/$10) - after that date these need updating
// to the standard $3/$15 rate, or actual spend will read lower than real.
const PRICE_PER_MTOK_INPUT = 2.0;
const PRICE_PER_MTOK_OUTPUT = 10.0;

// Haiku, not Sonnet: the species pre-detect call (used only by the
// smart-add/share-target flow, where species isn't known up front - see
// detectPetSpecies below) is a plain single-label visual classification
// task with a one-field output, a textbook fit for the fastest/cheapest
// model rather than the same model used for the full structured read.
const SPECIES_DETECT_MODEL = 'claude-haiku-4-5';
const SPECIES_DETECT_PRICE_PER_MTOK_INPUT = 1.0;
const SPECIES_DETECT_PRICE_PER_MTOK_OUTPUT = 5.0;

// Real cost from the API's own reported token usage, not a size-based
// guess - this is what makes the cost dashboard in settings trustworthy
// rather than a rough estimate on top of a rough estimate. Cache reads
// (not currently used by either call below, since neither system prompt is
// marked cacheable - kept here so cost stays correct if that changes) bill
// at roughly a tenth of the input rate.
function estimateCostUsd(usage, priceInput = PRICE_PER_MTOK_INPUT, priceOutput = PRICE_PER_MTOK_OUTPUT) {
  if (!usage) return 0;
  const inputTokens = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  return (
    (inputTokens * priceInput) / 1e6 +
    (cacheReadTokens * priceInput * 0.1) / 1e6 +
    (outputTokens * priceOutput) / 1e6
  );
}

// Must match CAT_COLORS/DOG_COLORS/CAT_BREEDS/DOG_BREEDS/COLLAR_COLORS in
// src/modules/shared/collections.js - the functions package doesn't share
// modules with the client, so these are kept in sync by hand. If any list
// is customized in the settings panel (config/colorOptions or
// config/breedOptions in Firestore, keyed by species), this static copy
// needs to be updated and redeployed too - the settings panel flags when
// they've drifted apart, deliberately not fetched live here (keeps this
// function simple/fast and avoids a Firestore dependency for something
// that changes rarely, same pattern as the static include/exclude word
// lists in Roy News).
// Base color only - the striped/mottled "tabby" pattern lives in
// CAT_PATTERNS below instead (a cat can be color="טריקולור" AND
// pattern="קליקו" at once - that's expected, not a conflict).
const CAT_COLORS = [
  'לבן',
  'שחור',
  'אפור',
  'כתום/ג׳ינג׳י',
  'קרם',
  'חום',
  'ג׳ינג׳י לבן',
  'אפור לבן',
  'טריקולור',
  'שחור-לבן',
  'אחר',
];
const DOG_COLORS = [
  'שחור',
  'לבן',
  'חום',
  'זהוב',
  'אפור',
  'שחור-חום (בְּלֶק אנד טאן)',
  'ברינדל/מרל',
  'שחור-לבן',
  'חום-לבן',
  'טריקולור',
  'אחר',
];
const CAT_BREEDS = [
  'מעורב / חתול רחוב',
  'פרסי',
  'מיין קון',
  'בנגלי',
  'סיאמי',
  'ראגדול',
  'ספינקס',
  'אבסיני',
  'יער נורווגי',
  'רוסי כחול',
  'אחר',
];
const DOG_BREEDS = [
  'מעורב (לא ידוע)',
  'לברדור',
  'גולדן רטריבר',
  'רועה גרמני',
  'האסקי סיברי',
  'פודל',
  'ביגל',
  'יורקשייר טרייר',
  'ג׳ק ראסל',
  'שיצו',
  'צ׳יוואווה',
  'בורדר קולי',
  'קולי',
  'קוקר ספניאל',
  'רוטוויילר',
  'דוברמן',
  'בוקסר',
  'שנאוצר',
  'מלטז',
  'קאן קורסו',
  'אמריקן סטפורדשייר (פיטבול)',
  'פינצ׳ר',
  'פומרניאן',
  'סלוקי',
  'אחר',
];
const COLLAR_COLORS = ['אדום', 'כחול', 'ורוד', 'שחור', 'לבן', 'אפור', 'צהוב', 'ירוק', 'כתום', 'סגול', 'צבעוני/כמה צבעים', 'אחר'];

// Cat-only coat pattern, separate from base color. "אחיד" (solid/no
// distinct pattern) is the common default, not a stand-in for "couldn't
// tell" - most cats simply have no special pattern.
const CAT_PATTERNS = ['אחיד', 'טאבי (מנומר)', 'קליקו', 'טורטי', 'טוקסידו', 'פוינט (קצוות כהות)', 'אחר'];

// Fields every extraction needs regardless of species - the large majority
// of the schema. Color, breed, furType, hasClippedEar, (cat-only) pattern,
// and (dog-only) weightKg/microchipNumber are NOT here: they differ enough
// per species (different enums, or not applicable at all - a cat's weight
// and chip number are rarely known/asked-about in these posts, unlike a
// dog's) that they live in
// CAT_ONLY_PROPERTIES/DOG_ONLY_PROPERTIES below instead, and get
// combined with this common set into two static per-species schemas at
// module load (see CAT_SCHEMA/DOG_SCHEMA) - one place maintains the shared
// fields, no risk of the two species schemas drifting apart on anything
// that's genuinely supposed to be identical. "species" itself isn't an
// output field here anymore either: the caller already knows it (either
// fixed from the dashboard mode, or resolved via detectPetSpecies below),
// and passes it in to pick which of the two schemas this call even uses.
const COMMON_PROPERTIES = {
  // Lets one shared extraction call serve both the lost-report and
  // found-report intake flows (and a single unified upload button that
  // doesn't ask the user to pre-pick a flow) - null when the post's own
  // framing genuinely doesn't say which it is.
  reportType: { anyOf: [{ type: 'string', enum: ['lost', 'found'] }, { type: 'null' }] },
  // Text fields use "" as the not-found sentinel rather than null: Anthropic
  // caps schemas at 16 nullable/union-typed parameters, and the client
  // already treats "" the same as null via `||` fallbacks, so there's no
  // need to spend the union-type budget on every text field. hasCollar
  // keeps real tri-state (true/false/null=unknown) since collapsing
  // "unknown" into false would misreport a case as collarless.
  petName: { type: 'string' },
  colorDescription: { type: 'string' },
  // anyOf, not type:['string','null']+enum - Anthropic rejects an enum
  // combined with an array-form type ("Enum value 'small' does not match
  // declared type '['string', 'null']'").
  size: { anyOf: [{ type: 'string', enum: ['small', 'medium', 'large'] }, { type: 'null' }] },
  // "kitten" also covers a puppy - one internal value shared across
  // species (see CAT_AGE_CLASSES in collections.js), not cat-specific
  // despite the name.
  ageClass: { anyOf: [{ type: 'string', enum: ['kitten', 'adult'] }, { type: 'null' }] },
  hasFluffyTail: { type: ['boolean', 'null'] },
  markings: { type: 'string' },
  hasCollar: { type: ['boolean', 'null'] },
  collarColor: { anyOf: [{ type: 'string', enum: COLLAR_COLORS }, { type: 'null' }] },
  collarHasBell: { type: ['boolean', 'null'] },
  city: { type: 'string' },
  neighborhood: { type: 'string' },
  location: { type: 'string' },
  condition: { type: 'string', enum: ['seen_only', 'held_by_finder', 'at_vet'] },
  dateText: { type: 'string' },
  computedDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  computedDateApprox: { type: 'boolean' },
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
};
const COMMON_REQUIRED = [
  'reportType',
  'petName',
  'colorDescription',
  'size',
  'ageClass',
  'hasFluffyTail',
  'markings',
  'hasCollar',
  'collarColor',
  'collarHasBell',
  'city',
  'neighborhood',
  'location',
  'condition',
  'dateText',
  'computedDate',
  'computedDateApprox',
  'contactName',
  'contactPhone',
  'captionText',
  'sourceGroupName',
  'originalPosterName',
  'sharedByName',
  'postAgeText',
  'mainPhotoRegion',
];

const CAT_ONLY_PROPERTIES = {
  color: { type: 'string', enum: CAT_COLORS },
  breed: { type: 'string', enum: CAT_BREEDS },
  // No "curly" option for cats - see CAT_FUR_TYPES in collections.js.
  furType: { anyOf: [{ type: 'string', enum: ['hairless', 'short', 'long'] }, { type: 'null' }] },
  // Cat-specific: whether a clipped/notched ear tip is visible (the
  // standard TNR marking) - not a meaningful concept for a dog at all, so
  // the dog schema below drops this field entirely rather than keeping it
  // always-null.
  hasClippedEar: { type: ['boolean', 'null'] },
  // Coat pattern, separate from base color - dogs don't get this field at
  // all (their pattern-ish info, like brindle/merle, is already folded
  // into DOG_COLORS as combo colors instead).
  pattern: { type: 'string', enum: CAT_PATTERNS },
};
const DOG_ONLY_PROPERTIES = {
  color: { type: 'string', enum: DOG_COLORS },
  breed: { type: 'string', enum: DOG_BREEDS },
  furType: { anyOf: [{ type: 'string', enum: ['hairless', 'short', 'long', 'curly'] }, { type: 'null' }] },
  // Not asked for cats - weight and chip number are rarely known/stated
  // for a street cat, unlike a dog.
  weightKg: { anyOf: [{ type: 'number' }, { type: 'null' }] },
  microchipNumber: { type: 'string' },
};

function buildSchema(speciesProperties, speciesRequired) {
  return {
    type: 'object',
    properties: { ...COMMON_PROPERTIES, ...speciesProperties },
    required: [...COMMON_REQUIRED, ...speciesRequired],
    additionalProperties: false,
  };
}

// Built once at module load (these are genuinely static - "a static schema
// for dog and a static schema for cat"), not per request.
const CAT_SCHEMA = buildSchema(CAT_ONLY_PROPERTIES, ['color', 'breed', 'furType', 'hasClippedEar', 'pattern']);
const DOG_SCHEMA = buildSchema(DOG_ONLY_PROPERTIES, ['color', 'breed', 'furType', 'weightKg', 'microchipNumber']);
const SCHEMAS_BY_SPECIES = { cat: CAT_SCHEMA, dog: DOG_SCHEMA };

function buildHeader(species) {
  const animal = species === 'dog' ? 'a dog' : 'a cat';
  return `You read screenshots of Facebook/WhatsApp posts about a lost, found, or sighted ${animal}, in Hebrew, Russian, English, or a mix, and extract structured facts. Follow these rules strictly:

- Never invent information. If a text field is not visible or not stated, return an empty string "" for it (not null). For "hasCollar", use null specifically to mean not stated/unclear - true and false are only for when the post clearly shows or says so.
- "reportType" is whether the post itself is framed as an animal being lost, or as one being found/seen/held - "lost" for a post from or on behalf of an owner looking for their own missing animal (e.g. "איבדתי", "מישהו ראה את החתולה שלי?", "נעדרת מאתמול", a flyer with the animal's name and "בואי הביתה"), "found" for a post about an animal that isn't the poster's own - sighted, caught, or being cared for pending the owner being found (e.g. "מצאתי", "נמצא/נמצאה", "מישהו מזהה?", "ראיתי חתול משוטט"). Base this on the post's actual wording and framing, not just on whether contact info is present. Null only if the text truly gives no usable signal either way (e.g. a bare photo with no caption and no other context).
- "petName" is the animal's own name, if given - e.g. a flyer's title like "מאיה בואי הביתה" (Maya, come home) means the name is "מאיה". Only the animal's name, never a person's name.`;
}

const COLOR_INTRO = `- "color" is your best classification into exactly one of the given Hebrew options, based on what's visible in the photos. Look at every provided photo of the animal before deciding, not just the first or most-cropped one - lighting, exposure, and screen glare vary a lot between phone photos and can make the same coat look washed out or shifted in one shot but not another. Judge by hue/undertone, not brightness: a pale or overexposed photo of an orange animal is still orange, not white or gray. Use these anchors to tell the easily-confused ones apart:`;
const COLOR_OUTRO = `  Pick the closest match even if the coat is patterned or multi-colored, and use "אחר" only if truly none of the other options fit. "colorDescription" is separate: the fuller free-text description (patterns, patches, markings related to color) in whatever language the post/your description is in - it can and should contain more detail than "color" does.
  Before finalizing, check the two against each other: whatever hues you actually name in "colorDescription" must be the ones that justify your "color" pick - if you write that the coat is white with brown/beige patches, "color" must be the white-plus-brown option, not white-plus-black or a plain single color. Never let "color" name a hue "colorDescription" doesn't also support.`;
const CAT_COLOR_ANCHORS = `  - "שחור" (black) is a solid black coat - don't undersell an obviously black cat by reaching for "אחר" or a patched option just because of a few tiny white hairs or a small chin/chest fleck; use "שחור-לבן" only once the white patching is clearly substantial (a real chest patch, socks, a bib), not a minor fleck.
  - "לבן" (white) is a solid white coat, the same way - reserve "ג'ינג'י לבן"/"אפור לבן"/"שחור-לבן" for a coat that's clearly two-toned, not a mostly-white coat with a tiny colored fleck.
  - "אפור" (gray) is a cool, neutral gray with no red/orange/yellow undertone at all - like slate or ash. If the coat has any warm reddish, orange, or golden tint, it is not gray, even if it looks pale, faded, or grayish in low light.
  - "כתום/ג'ינג'י" (orange/ginger) is a warm reddish-orange to amber hue, often with tabby striping - this is one of the most common cat colors and is frequently misread as gray or brown in bad lighting, so look specifically for warm undertone before ruling it out.
  - "קרם" (cream) is a very pale, warm ivory/beige tone - distinctly warmer than אפור (which has no warm undertone at all) and much paler/softer than כתום/ג'ינג'י (a vivid, saturated orange). This is a common Persian/longhair color - don't default to אפור or אחר just because the coat looks pale or washed out; check for a warm undertone first.
  - "חום" (brown) is a warm but muted brown/chocolate tone - warmer than gray, less vivid/red than כתום/ג'ינג'י.
  - "ג'ינג'י לבן" and "אפור לבן" are for a coat with clearly separate patches of white plus (respectively) orange or gray - not a single blended pale color.
  - "טריקולור" is for a coat with three distinct colors patched together (typically white, black, and orange/ginger) - a striped/mottled texture on top of this is captured separately by "pattern" (see below), not by color.`;
const DOG_COLOR_ANCHORS = `  - "שחור" (black) is a solid black coat - don't undersell an obviously black dog by reaching for "אחר" or a patched option just because of a few tiny white hairs or a small chin/chest fleck; use "שחור-לבן" only once the white patching is clearly substantial (a real chest patch, socks, a bib), not a minor fleck.
  - "לבן" (white) is a solid white coat, the same way - reserve "חום-לבן"/"שחור-לבן" for a coat that's clearly two-toned, not a mostly-white coat with a tiny colored fleck.
  - "חום" (brown) is a warm but muted brown/chocolate tone.
  - "זהוב" (golden) is a warm honey/golden-blonde tone typical of breeds like Golden Retrievers or Labradors - a similar coat that leans more reddish than honey-blonde can still fit here; use whichever of חום/זהוב is the closer match.
  - "אפור" (gray) is a cool, neutral gray with no red/orange/yellow undertone at all - like slate, silver, or ash (e.g. a Weimaraner or a gray-coated Husky). If the coat has any warm reddish or golden tint, it is not gray, even if it looks pale or faded.
  - "ברינדל/מרל" covers either a brindle stripe pattern (fine stripes, often on a tan/brown base) or a merle mottled/marbled coat (mixed patches, sometimes blue/odd eyes) - use this single option for both, don't try to pick between them.
  - "שחור-חום (בְּלֶק אנד טאן)" is a coat with a black body and sharply defined tan/brown points (muzzle, eyebrows, chest, legs).
  - "טריקולור" is for a coat with three distinct, clearly separated colors (typically black, white, and tan/brown patches) - common in breeds like ביגל, קולי, ברניז מאונטן דוג. Don't use this for a two-tone coat (that's שחור-לבן/חום-לבן) or for שחור-חום, which is a specific black-body-with-tan-points pattern, not three separately patched colors.`;

function buildColorBullet(species) {
  const anchors = species === 'dog' ? DOG_COLOR_ANCHORS : CAT_COLOR_ANCHORS;
  return [COLOR_INTRO, anchors, COLOR_OUTRO].join('\n');
}

const CAT_BREED_BULLET = `- "breed" is only for a specific, named breed from the given list. If the post text explicitly names a breed - in Hebrew or any other language/script (e.g. an English name like "Ragdoll", "Persian", "Maine Coon") - match it to the corresponding Hebrew option in the list and use that; an explicitly stated breed always wins over your own visual impression, even if the photo looks to you like it could be a different breed - text stating a specific, named breed is stronger evidence than a visual guess, since a breed is often not reliably identifiable from a photo alone. Only fall back to a purely visual read (e.g. a clearly hairless Sphynx, a clearly flat-faced Persian) when the text gives no breed at all. The overwhelming majority of street cats in these posts are ordinary mixed-breed cats with no identifiable breed - use "מעורב / חתול רחוב" in that default case rather than guessing a breed from a generic coat/body type. A wrong guess here is actively misleading, not a harmless default - only pick a specific named breed when the text states one explicitly, or you're genuinely confident from the photo.`;
const DOG_BREED_BULLET = `- "breed" is only for a specific, named breed from the given list. If the post text explicitly names a breed - in Hebrew or any other language/script (e.g. an English name) - match it to the corresponding Hebrew option in the list and use that; an explicitly stated breed always wins over your own visual impression, even if the photo looks to you like it could be a different breed - text stating a specific, named breed is stronger evidence than a visual guess. Only fall back to a purely visual read (e.g. a clearly recognizable Husky or German Shepherd build/coat) when the text gives no breed at all. A dog is meaningfully more likely than a street cat to be purebred or a clearly recognizable mix, so a confident visual read is often worth recording when the text gives no breed - but use "מעורב (לא ידוע)" whenever you're not genuinely confident, rather than guessing a specific breed from a generic build. A wrong guess here is actively misleading, not a harmless default.`;

const CLIPPED_EAR_BULLET = `- "hasClippedEar" is whether the animal has a clipped/notched ear tip (usually the left ear) - the standard visual marking left after a street cat is trap-neuter-released (TNR), a small flat cut or V-notch at the very tip of one ear, distinct from an injury. true only if this specific marking is visible, false if an ear is clearly visible and clearly NOT clipped, null if ears aren't visible clearly enough to tell either way. This is worth looking for carefully - it's one of the most reliable identifying marks for a street cat, and easy to miss if you're not specifically checking the ear tips.`;

const SIZE_AGE_BULLETS = `- "size" is your best guess at the animal's physical size (small, medium, or large) from the photos, or null if no photo gives any real basis to judge.
- "ageClass" is separate from size - "kitten" for a clearly young kitten or puppy (this one value covers both), "adult" otherwise, or null if unclear. A small adult animal is "adult", not "kitten".`;

const DOG_WEIGHT_CHIP_BULLET = `- "weightKg" is a real number of kilograms only when the post explicitly states a weight (e.g. "כלב בגודל 20 ק\"ג בערך") - never estimate a weight visually from a photo alone, leave it null in that case; a wrong number here actively misleads a numeric comparison later, unlike "size" which is deliberately just a rough visual bucket. "microchipNumber" is only for an explicit chip/microchip number written in the post text (e.g. "מספר שבב: 985141...") - never inferred or guessed. Leave "" if no chip number is stated, which is the default/common case.`;

const CAT_FUR_BULLET = `- "furType" is your best classification of the coat itself into exactly one of 3 categories, based on what's visible in the photos: "hairless" (little to no fur - e.g. a Sphynx cat), "short" (an ordinary coat that lies close to the body - the large majority of cats, including a coat that's a bit fuller around the neck/tail without being dramatically long), "long" (fur is clearly, noticeably long over most of the body, well beyond an ordinary short coat - e.g. a Persian/Maine Coon cat). There is no separate "medium" category - a borderline coat that's fuller than average but not dramatically long is "short", not "long"; reserve "long" for a coat that's unmistakably long. Null if no photo gives a clear enough view of the coat to judge. "hasFluffyTail" is separate and independent - true only if the tail specifically is unusually thick/bushy/plume-like even relative to the rest of the coat (this can be true even on an otherwise short-coated animal), false if the tail is clearly visible and clearly not unusually fluffy, null if the tail isn't clearly visible.`;
const DOG_FUR_BULLET = `- "furType" is your best classification of the coat itself into exactly one of 4 categories, based on what's visible in the photos: "hairless" (little to no fur - e.g. a Xoloitzcuintli/Chinese Crested dog), "short" (an ordinary coat that lies close to the body - the large majority of dogs like a Labrador or Boxer, including a coat that's a bit fuller around the neck/tail without being dramatically long), "long" (fur is clearly, noticeably long over most of the body, well beyond an ordinary short coat - e.g. a Golden Retriever/Collie/Shih Tzu dog), "curly" (fur is wavy or curly rather than straight, regardless of length - e.g. a Poodle/Bichon dog). There is no separate "medium" category - a borderline coat that's fuller than average but not dramatically long is "short", not "long"; reserve "long" for a coat that's unmistakably long. Null if no photo gives a clear enough view of the coat to judge. "hasFluffyTail" is separate and independent - true only if the tail specifically is unusually thick/bushy/plume-like even relative to the rest of the coat (this can be true even on an otherwise short-coated animal), false if the tail is clearly visible and clearly not unusually fluffy, null if the tail isn't clearly visible.`;

const COLLAR_BULLET = `- "collarColor" is the color of the collar/harness itself (only meaningful if hasCollar is true) - one of the given options, or null if there's no visible collar or its color can't be told. "collarHasBell" is whether a bell is visibly hanging from the collar - true/false only when the collar is clearly visible enough to tell, null otherwise (same reasoning as hasCollar).`;

const PATTERN_BULLET = `- "pattern" is the cat's coat pattern, classified separately from its base color ("color" above), into exactly one of the given options. Most cats are simply "אחיד" (solid/no distinct pattern) - the correct default whenever the coat is just one blended color, or a color+white combination, with no further pattern on top. Use "טאבי (מנומר)" for a striped/mottled coat. Use "קליקו" for a classic patched coat with distinct black and orange/ginger patches together with white (a cat can be color="טריקולור" and pattern="קליקו" at the same time - that's expected, not a conflict). Use "טורטי" for a mottled mix of black and orange/cream patches with little or no white - a subtler, less distinctly patched cousin of calico. Use "טוקסידו" for a mostly-solid coat (usually black) with a distinct, roughly symmetric white bib/chest/paws/belly, resembling formal wear. Use "פוינט (קצוות כהות)" for a pale/cream body with clearly darker color concentrated at the face, ears, legs, and tail (the classic Siamese look). Use "אחר" only if the coat shows a real, distinct pattern that doesn't fit any of these.`;

const REST_OF_PROMPT = `- "markings" lists distinct identifying marks, one per line (use \\n between them) - do not write one flowing sentence combining them. E.g. two lines "נקודה שחורה ליד האף" and "אוזניים קצרות מהרגיל", not one sentence joining both. Each line should be a single specific, visually-checkable feature: a spot, a scar, an asymmetry, a missing limb, or a color patch at a specific location (e.g. "כתמים בגוון קרם באוזניים ובזנב"). A generic, whole-coat description ("white cat", "mostly gray with some white") belongs only in colorDescription, not here - but if colorDescription itself calls out where on the body a patch or pattern appears, restate that as its own line in markings too, since a located patch is just as identifying as a scar or notch and markings is what actually gets compared during matching (colorDescription is for display only). Leave "" if nothing distinctive beyond generic coloring is visible or mentioned.
- "city" and "neighborhood" split out of the post's location text where possible (e.g. "רמת גן, ליד הפארק" -> city "רמת גן", neighborhood/area "" or a more specific area if named). Leave neighborhood "" if the post only names a city, or if you can't confidently separate the two.
- "condition" is the animal's current physical custody, based on what the post text actually says happened to it - not just that it was photographed: "held_by_finder" if the poster currently has the animal in their own possession/care/home (e.g. "אצלי", "ביניתיים אצלי", "לקחתי אותה הביתה", "טיפלתי בו"), including when the post also mentions a vet visit but the animal is back with the poster or still in the poster's short-term care afterward - a vet visit alone doesn't change this if the animal ends up with the finder. "at_vet" only if the animal was left at / transferred to a clinic or shelter and is not with the poster anymore (e.g. "הועבר למרפאה ונשאר שם", "בטיפול הוטרינר"). "seen_only" is the default and by far the most common case - the animal was merely sighted/photographed in public, was not caught, and nobody claims to be holding it.
- "sourceGroupName" is the Facebook/WhatsApp group or page name shown in the screenshot's header (not a person's name).
- Facebook posts are sometimes shown as "shared" from another group by one person, originally written by a different person. In that case, "originalPosterName" is whoever wrote the original post/caption, and "sharedByName" is the person who re-shared it into the group visible in the screenshot. If there is no sharing chain, leave "sharedByName" as "" and put the single visible author in "originalPosterName".
- "contactName"/"contactPhone" are only for a phone number explicitly given in the post text for contacting someone about the animal - not the poster's account name if no phone is given.
- "dateText" and "postAgeText" are the literal text shown (e.g. "21/5" or "19 שעות" or "3 days ago") - copy them as written, do not convert them here.
- "computedDate" is a real calendar date, YYYY-MM-DD, for when the animal was actually lost/found/seen. The user message tells you today's date - use it as your only reference point:
  - If dateText clearly states when the animal was seen/lost (a specific date, or a relative duration like "3 days ago"), use that as the primary source.
  - Many posts never say anything about the sighting itself - only the caption's own topic ("who lost this cat?") plus the surrounding social-media UI's own post-age indicator (the small text next to the poster's name/timestamp, e.g. "1 ימים" / "19 hours ago" - that's what postAgeText captures). When dateText is empty or too vague to convert but postAgeText gives a specific duration, use postAgeText instead: a "have you seen this cat" post is normally made close to when the animal was actually seen, even if not identical to the minute.
  - A date written as DD/MM with no year (Israeli convention, day before month - "21/5" is May 21st) belongs to the current year unless that would place it in the future, in which case use the previous year instead - a lost/found post is never dated after today.
  - A relative duration converts to today's date minus that duration, at any scale - not just hours/days: "3 days ago"/"19 שעות"/"1 ימים" (days/hours), "לפני שבוע"/"שבועיים" (weeks), "לפני חודש"/"לפני 3 חודשים" (months), "לפני שנה"/"שנתיים" (years) are all computable the same way. Convert with standard approximations since none of these are exact: a week = 7 days, a month = 30 days, a year = 365 days.
  - If neither field gives you a specific, computable duration or date - a holiday name, "a while ago", or nothing at all - leave this null rather than guessing. A missing date is fine; a wrong one actively hurts matching.
- "computedDateApprox" is true whenever computedDate was derived from a relative duration (at any scale - "3 days ago", "לפני חודש", postAgeText's "1 ימים") rather than an explicit date ("21/5"). A relative duration is anchored to whenever the post was actually viewed/screenshotted, which the uploader may have done well after the original sighting - today's date minus the duration is only a rough stand-in for the true date, with unknown extra drift (and that drift only grows for a coarser duration like "a year ago" - a month of slack either way is entirely plausible, more so than for "3 days ago"). An explicit date has no such drift, so set this false whenever computedDate came from one (or is null).
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

function buildSystemPrompt(species) {
  const parts = [
    buildHeader(species),
    buildColorBullet(species),
    species === 'dog' ? DOG_BREED_BULLET : CAT_BREED_BULLET,
    SIZE_AGE_BULLETS,
    species === 'dog' ? DOG_FUR_BULLET : CAT_FUR_BULLET,
    species === 'dog' ? DOG_WEIGHT_CHIP_BULLET : '',
    COLLAR_BULLET,
    species === 'cat' ? CLIPPED_EAR_BULLET : '',
    species === 'cat' ? PATTERN_BULLET : '',
    REST_OF_PROMPT,
  ].filter(Boolean);
  return parts.join('\n');
}

// Built once at module load, same as the schemas above.
const SYSTEM_PROMPTS_BY_SPECIES = { cat: buildSystemPrompt('cat'), dog: buildSystemPrompt('dog') };

const SPECIES_DETECT_SCHEMA = {
  type: 'object',
  properties: { species: { type: 'string', enum: ['cat', 'dog', 'other', 'unknown'] } },
  required: ['species'],
  additionalProperties: false,
};
const SPECIES_DETECT_PROMPT = `Look at this photo from a lost/found pet post and classify which animal it shows: "cat" or "dog" for either of those, "other" for a different kind of animal entirely (bird, rabbit, hamster, etc.), "unknown" only if no animal is identifiable at all from the photo.`;

/**
 * Cheap, fast species-only classification of a single photo - used only by
 * the smart-add/share-target flow (see useSmartIntake.js), which is the one
 * intake path that genuinely doesn't know cat-or-dog before extraction can
 * even pick a schema. Every other flow already knows species up front (the
 * dashboard's fixed mode, or an existing record's own saved species) and
 * skips this call entirely - no added cost or latency there.
 */
export const detectPetSpecies = onCall(
  { region: 'europe-west1', cors: true, secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const image = request.data?.image;
    if (!image?.base64) {
      throw new HttpsError('invalid-argument', 'An image is required.');
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: SPECIES_DETECT_MODEL,
      max_tokens: 64,
      thinking: { type: 'disabled' },
      system: SPECIES_DETECT_PROMPT,
      output_config: { format: { type: 'json_schema', schema: SPECIES_DETECT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [{ type: 'image', source: { type: 'base64', media_type: image.mimeType || 'image/jpeg', data: image.base64 } }],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      throw new HttpsError('internal', 'No result returned.');
    }

    try {
      const parsed = JSON.parse(textBlock.text);
      parsed._aiUsage = {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        estimatedCostUsd: estimateCostUsd(
          response.usage,
          SPECIES_DETECT_PRICE_PER_MTOK_INPUT,
          SPECIES_DETECT_PRICE_PER_MTOK_OUTPUT
        ),
      };
      return parsed;
    } catch {
      throw new HttpsError('internal', 'Could not parse the result.');
    }
  }
);

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

    const species = request.data?.species;
    if (species !== 'cat' && species !== 'dog') {
      throw new HttpsError('invalid-argument', 'species must be "cat" or "dog".');
    }

    // Optional caption/link text captured alongside the screenshot(s) -
    // shared in from Facebook's own share sheet (which hands over the post's
    // full text/URL but never a photo) or pasted in by hand. A screenshot
    // alone often cuts off long captions ("...עוד"); this fills that gap
    // without replacing the image-based extraction, which is still required.
    const postText = typeof request.data?.postText === 'string' ? request.data.postText.slice(0, 4000) : '';

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
      // Claude Sonnet 5 runs adaptive thinking by default when this is
      // omitted - real reasoning time that this task doesn't need, since
      // it's bounded visual classification into a fixed schema, not
      // open-ended judgment. Disabling it is the single biggest lever on
      // the ~1-minute latency this call was taking.
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPTS_BY_SPECIES[species],
      output_config: { format: { type: 'json_schema', schema: SCHEMAS_BY_SPECIES[species] } },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            ...(postText
              ? [
                  {
                    type: 'text',
                    text: `Additional text shared alongside the screenshot(s) - this is the post's own caption/link text and may include content cut off in the image (e.g. "...עוד"). Prefer it over the image where they overlap:\n${postText}`,
                  },
                ]
              : []),
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
      // Real per-call cost from the API's own usage figures, carried back to
      // the client so it can accumulate onto the resulting record - this is
      // the only AI spend in the app, so this is the whole cost picture.
      parsed._aiUsage = {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        estimatedCostUsd: estimateCostUsd(response.usage),
      };
      return parsed;
    } catch {
      throw new HttpsError('internal', 'Could not parse the extraction result.');
    }
  }
);

const FACEBOOK_HOSTNAME_RE = /(^|\.)facebook\.com$|^fb\.watch$|^fb\.me$/i;
const MAX_PREVIEW_IMAGE_BYTES = 8 * 1024 * 1024;

function isFacebookUrl(raw) {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && FACEBOOK_HOSTNAME_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

// Facebook's HTML escapes non-ASCII into numeric character references
// (Hebrew text comes back as a long run of &#xNNNN; entities) - this
// covers those plus the handful of named entities that show up in
// practice, without pulling in a full HTML-entity-decoding dependency.
function decodeHtmlEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTrailingFacebook(title) {
  return title.replace(/\s*\|\s*Facebook\s*$/i, '');
}

// Facebook's og:title for a group/page post reliably comes back as
// "{group or page name} | {post's own caption} | Facebook" - splitting on
// " | " and taking the first piece recovers the group name without ever
// needing to log in and look at the group directly. A personal post's
// title has no such prefix, so this comes back empty for those instead of
// guessing.
function extractGroupNameFromTitle(title) {
  const parts = stripTrailingFacebook(title).split(' | ');
  return parts.length > 1 ? parts[0].trim() : '';
}

// Attribute order in Facebook's <meta property="og:X" content="..."> tags
// is consistent in practice, but matching both orders is cheap insurance
// against a markup change breaking this silently.
function extractOgTag(html, property) {
  const propertyFirst = new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["']`, 'i');
  const contentFirst = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["']`, 'i');
  const match = html.match(propertyFirst) || html.match(contentFirst);
  return match ? decodeHtmlEntities(match[1]) : '';
}

/**
 * Pulls a public Facebook post's own preview text/photo straight from the
 * link, using the same "facebookexternalhit" crawler identity Facebook
 * itself expects when generating the rich preview shown when a link is
 * pasted into Messenger/WhatsApp - a normal browser or plain fetch gets a
 * login wall, but this identity gets the post's public og:title/
 * og:description/og:image directly, no login involved and nothing beyond
 * what the post already exposes for that exact purpose.
 *
 * Only works when the group's post content itself is visible to non-members
 * - a group can be publicly listed/joinable while still restricting its
 * actual posts to members only, in which case Facebook hands back generic
 * group-level info instead (see isGenericGroupFallback below), same as it
 * would for anyone trying to view the post without joining. Always a
 * best-effort supplement to the screenshot-based reading, never a
 * replacement for it.
 */
export const fetchFacebookLinkPreview = onCall({ region: 'europe-west1', cors: true, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const url = request.data?.url;
  if (typeof url !== 'string' || !isFacebookUrl(url)) {
    throw new HttpsError('invalid-argument', 'A facebook.com link is required.');
  }

  let html;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
      redirect: 'follow',
    });
    html = await res.text();
  } catch {
    return { text: '', imageBase64: null, imageMimeType: null, groupName: '' };
  }

  const rawTitle = extractOgTag(html, 'title');
  const description = extractOgTag(html, 'description');
  let groupName = extractGroupNameFromTitle(rawTitle);

  // A restricted/closed group's post doesn't expose its real content to an
  // anonymous crawler at all - Facebook falls back to generic group-level
  // info instead (title = just the group's own name, no og:description),
  // even though a member sees the actual post fine. That fallback has no
  // og:description AND no "Group | Caption" split to pull a group name out
  // of (a normal accessible post always has at least one of the two) - in
  // that specific combination, the title is almost certainly just the
  // group's name, not this post's caption, and the image is almost
  // certainly a generic group graphic, not a photo of the animal. Treating
  // caption/photo as "nothing found" is more honest than showing the
  // group's name as if it were the post's own caption.
  const isGenericGroupFallback = !description && !groupName;
  // The group name itself is still real, useful source info even then
  // (see sourceGroupName elsewhere in the app) - in the fallback case the
  // whole title IS the group's own name, just not split out yet.
  if (isGenericGroupFallback) groupName = stripTrailingFacebook(rawTitle);
  const text = isGenericGroupFallback ? '' : description || stripTrailingFacebook(rawTitle);
  const imageUrl = isGenericGroupFallback ? '' : extractOgTag(html, 'image');

  let imageBase64 = null;
  let imageMimeType = null;
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      const contentType = imgRes.headers.get('content-type') || '';
      if (imgRes.ok && contentType.startsWith('image/')) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length <= MAX_PREVIEW_IMAGE_BYTES) {
          imageBase64 = buf.toString('base64');
          imageMimeType = contentType.split(';')[0];
        }
      }
    } catch {
      // Text alone is still useful - the image is a bonus, not required.
    }
  }

  return { text, imageBase64, imageMimeType, groupName };
});

// Small enough to cover a 64px CSS thumbnail even at 3x pixel density, with
// headroom - matches THUMB_MAX_DIMENSION in src/modules/shared/
// imageCompression.js (the same sizing new uploads use, see
// thumbnailIndex in uploadPhotos.js).
const THUMB_MAX_DIMENSION = 220;
const THUMB_JPEG_QUALITY = 70;

// Mirrors the "<base>.jpg" / "<base>_thumb.jpg" naming a fresh client
// upload gives a photo (see uploadPhotos.js), so a thumbnail generated here
// lives right next to the photo it belongs to.
function deriveThumbPath(path) {
  return path.replace(/\.jpg$/i, '_thumb.jpg');
}

// Admin-side file writes don't get a client-style download URL for free -
// this builds the same firebasestorage.googleapis.com?alt=media&token=...
// shape getDownloadURL() returns, using a token set on the file's own
// metadata, so a thumbUrl generated here is indistinguishable from one
// created by a fresh client upload.
async function uploadThumbnail(bucket, thumbPath, buffer) {
  const token = randomUUID();
  const file = bucket.file(thumbPath);
  await file.save(buffer, {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(thumbPath)}?alt=media&token=${token}`;
}

async function generateThumbnailFor(bucket, photo) {
  const [buffer] = await bucket.file(photo.path).download();
  const thumbBuffer = await sharp(buffer)
    .resize(THUMB_MAX_DIMENSION, THUMB_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMB_JPEG_QUALITY })
    .toBuffer();
  const thumbPath = deriveThumbPath(photo.path);
  const thumbUrl = await uploadThumbnail(bucket, thumbPath, thumbBuffer);
  return { ...photo, thumbPath, thumbUrl };
}

/**
 * Generates a thumbnail for one specific already-uploaded photo, given its
 * Storage path and download url - and nothing else; it doesn't touch
 * Firestore. Used when a secondary photo (which, per the thumbnailIndex
 * policy in uploadPhotos.js, was never thumbnailed on upload) is promoted
 * to be a record's main photo, or becomes the main photo because the
 * previous one was deleted - the caller merges the result into its own
 * photos array and writes it, same as it already does for a plain reorder/
 * delete. Runs server-side rather than in the browser - a client-side
 * fetch() of an existing photo's download URL hits Firebase Storage's CORS
 * policy, which only allows same-origin <img> loads, not cross-origin
 * fetch/canvas reads.
 */
export const generatePhotoThumbnail = onCall({ region: 'europe-west1', cors: true, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const { path, url } = request.data || {};
  if (typeof path !== 'string' || typeof url !== 'string') {
    throw new HttpsError('invalid-argument', 'path and url are required.');
  }

  try {
    const bucket = getStorage().bucket();
    const result = await generateThumbnailFor(bucket, { path, url });
    return { thumbPath: result.thumbPath, thumbUrl: result.thumbUrl };
  } catch (err) {
    console.error('generatePhotoThumbnail failed for', path, err);
    throw new HttpsError('internal', 'Could not generate a thumbnail for this photo.');
  }
});

// Haiku, not Sonnet: this is a single visual-similarity judgment between two
// already-known photos, not open-ended extraction - the same reasoning as
// Upgraded from claude-haiku-4-5 after two confirmed cases of confidently
// wrong verdicts - not vague hedging, but flatly misdescribing a photo
// (missing an obvious orange patch covering a cat's whole head/ears) even
// after two rounds of prompt tuning aimed at exactly that failure mode.
// Costs roughly 3x more per call, but this only ever runs on pairs that
// already cleared the admin-configured field-score threshold (see
// matchingApi.js) - a small minority of the whole pool, not every pair -
// so the absolute cost stays small while accuracy matters a lot more here:
// a wrong "noMatch" silently zeroes out a real match's score.
const PHOTO_SIMILARITY_MODEL = 'claude-sonnet-5';
const PHOTO_SIMILARITY_PRICE_PER_MTOK_INPUT = 3.0;
const PHOTO_SIMILARITY_PRICE_PER_MTOK_OUTPUT = 15.0;

// Verdict buckets deliberately reuse the exact same keys as
// CONFIDENCE_BUCKETS in matchingEngine.js (noMatch/low/medium/high) - this
// is the same "how likely is it these are the same animal" scale the app
// already shows for the field-based score, just applied to a photo
// comparison instead. That lets matchingApi.js's disqualify-threshold logic
// reuse CONFIDENCE_BUCKETS' rank order directly instead of maintaining a
// second, parallel scale.
const PHOTO_SIMILARITY_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['high', 'medium', 'low', 'noMatch'] },
    explanation: { type: 'string' },
  },
  required: ['verdict', 'explanation'],
  additionalProperties: false,
};

const PHOTO_SIMILARITY_PROMPT = `You are comparing two photos to judge how likely it is that they show the same individual cat or dog. One photo is from a "lost pet" report, the other from a "found/seen pet" report - they were taken by different people, at different times (anywhere from hours to weeks apart), possibly in different lighting/angles/photo quality.

Not all identifying features are equally reliable. The strongest signals are coat color/pattern and the animal's face - specifically its nose (shape, color, and any spotting on it) and the overall facial structure/proportions, which vets rely on as being about as individually distinctive in cats and dogs as a fingerprint is in a person. Both stay visible and comparable even through blur, a bad angle, or different lighting, and two unrelated individuals only rarely share both the same coat AND the same face/nose. Distinctive body markings are next most reliable. General body build and silhouette (tall/short, thin/stocky, overall body shape) is the WEAKEST signal - it varies enormously with breed, pose, angle, and how filled-out or thin an animal looks in a given photo, and many unrelated animals of a similar breed or size share a similar silhouette. A shared build or a similarly-shaped body is NOT enough on its own to call two animals a plausible match: if the coat color/pattern is visible in both photos and clearly does not match, OR the face/nose is clearly visible in both and clearly doesn't match (different nose shape/color, different facial proportions), that alone should pull your verdict down to "low" or "noMatch" even when the general build looks similar - not up to "medium". Reserve "medium"/"high" for cases where the coat and/or face itself genuinely supports a match (or both are genuinely too unclear in BOTH photos to judge at all) - not for "different coat and face, but similar-looking dogs/cats overall".

Classify how likely these are the same animal into exactly one of:
- "high": strong visual evidence these are the same animal (matching coat, and/or matching face/nose shape and markings, no conflicting evidence).
- "medium": plausibly the same animal, but with real uncertainty (e.g. the coat and face/nose are both too unclear in both photos to judge, or only partial visual evidence).
- "low": more likely different than the same - a visible coat or face/nose difference that isn't stark enough to be certain, weak or partial conflicting evidence, OR the photos are too poor/limited (blurry, animal not clearly visible, very different framing) to compare with any real confidence either way. Nothing here definitively rules it out, but there's no real basis to call it a match.
- "noMatch": clear, confident visual evidence these are different animals (mismatched coat color/pattern, mismatched face/nose shape or markings, or other clearly conflicting physical traits that leave little doubt).

"explanation" is a short (1-2 sentence), specific, plain-language reason for your verdict - name the actual visual feature(s) that drove it (or, for "low", say plainly if it's because the photos themselves are hard to compare), in Hebrew.`;

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch image (${res.status})`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString('base64'), mimeType: contentType.split(';')[0] };
}

/**
 * Judges whether two already-uploaded photos (one from a lost-pet report,
 * one from a found/seen-pet report) could plausibly show the same animal -
 * a refinement layered on top of the free, deterministic field-based
 * matching (see matchingEngine.js), not a replacement for it. Only called
 * for pairs that already score into the admin-configured confidence
 * threshold (see photoMatchThreshold in matchConfigApi.js), so this stays a
 * small, bounded addition to AI spend rather than one call per lost-case/
 * found-report pair in the whole pool.
 */
export const comparePhotoSimilarity = onCall(
  { region: 'europe-west1', cors: true, secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const { lostPhotoUrl, foundPhotoUrl } = request.data || {};
    if (typeof lostPhotoUrl !== 'string' || typeof foundPhotoUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'lostPhotoUrl and foundPhotoUrl are required.');
    }

    let lostImage, foundImage;
    try {
      [lostImage, foundImage] = await Promise.all([fetchImageAsBase64(lostPhotoUrl), fetchImageAsBase64(foundPhotoUrl)]);
    } catch (err) {
      console.error('comparePhotoSimilarity: could not load photos', err);
      throw new HttpsError('internal', 'Could not load one of the photos.');
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: PHOTO_SIMILARITY_MODEL,
      max_tokens: 1200,
      thinking: { type: 'adaptive' },
      system: PHOTO_SIMILARITY_PROMPT,
      output_config: { format: { type: 'json_schema', schema: PHOTO_SIMILARITY_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'תמונה מדיווח על חיה אבודה:' },
            { type: 'image', source: { type: 'base64', media_type: lostImage.mimeType, data: lostImage.base64 } },
            { type: 'text', text: 'תמונה מדיווח על חיה שנמצאה/נראתה:' },
            { type: 'image', source: { type: 'base64', media_type: foundImage.mimeType, data: foundImage.base64 } },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      throw new HttpsError('internal', 'No result returned.');
    }

    try {
      const parsed = JSON.parse(textBlock.text);
      // Lets the client tell a verdict from a since-retired model apart
      // from one that's still current - see isVisualSimilarityStale in
      // matchingApi.js, which otherwise has no way to know a verdict was
      // produced by an older, less reliable model version.
      parsed.model = PHOTO_SIMILARITY_MODEL;
      parsed._aiUsage = {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        estimatedCostUsd: estimateCostUsd(
          response.usage,
          PHOTO_SIMILARITY_PRICE_PER_MTOK_INPUT,
          PHOTO_SIMILARITY_PRICE_PER_MTOK_OUTPUT
        ),
      };
      return parsed;
    } catch {
      throw new HttpsError('internal', 'Could not parse the result.');
    }
  }
);
