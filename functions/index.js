import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

initializeApp();
const db = getFirestore();

// A signed-in caller only means "has a Google account" - anyone, not just
// people actually using this app - and every function below that calls
// Claude bills real money per call regardless of whether it's reached
// through the app's own UI or a direct request with a stolen/copied auth
// token. This caps worst-case exposure per account rather than trying to
// distinguish real usage from abuse: generous enough that a regular user
// submitting several reports (or running a normal "check matches" scan,
// which can fire comparePhotoSimilarity several times in one click) in an
// hour never comes close, low enough that a script hammering one of these
// endpoints hits a wall fast. Deliberately NOT applied to
// fetchFacebookLinkPreview/generatePhotoThumbnail below - neither calls
// Claude, so neither carries the same per-call cost risk. Admins/editors
// are exempt entirely: they're trusted, known individuals (not the
// anonymous-signed-in-stranger case this guards against), and the
// legitimate bulk admin actions in Settings (rescan everything, photo-
// similarity backfill) can genuinely call these dozens of times in one
// deliberate action.
const RATE_LIMIT_MAX_CALLS = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Writes into both cost ledgers this app keeps - one row per user
 * (userCosts/{uid}, the per-user breakdown/flag in Settings) and one single
 * site-wide row (config/costLedger, the "עלות AI" totals) - every time an
 * AI call actually costs something. uid comes from request.auth, never
 * trusted from the client. Both ledgers track a lifetime total per cost
 * category (aiCostUsd = species-detect + screenshot extraction,
 * visualMatchCostUsd = AI photo comparison) plus a current-calendar-month
 * total that resets itself the moment a call lands in a new month key
 * (YYYY-MM), no separate scheduled reset job needed. Every caller awaits
 * this (adds one small Firestore round-trip to an AI call that already
 * takes seconds) rather than firing-and-forgetting it, since a v2
 * function's background work isn't guaranteed to run once the response has
 * already gone out - losing ledger entries silently would defeat the whole
 * point. Errors are swallowed (logged, not thrown) so a ledger write never
 * fails the user-facing AI call itself.
 */
async function recordCost(uid, field, costUsd) {
  if (!costUsd) return;
  const monthKey = new Date().toISOString().slice(0, 7);
  await Promise.all([
    incrementUserCostDoc(db.collection('userCosts').doc(uid), field, costUsd, monthKey),
    incrementGlobalCostDoc(db.collection('config').doc('costLedger'), field, costUsd, monthKey),
  ]);
}

async function incrementUserCostDoc(ref, field, costUsd, monthKey) {
  try {
    const snap = await ref.get();
    const sameMonth = snap.exists && snap.data().currentMonthKey === monthKey;
    await ref.set(
      {
        [field]: FieldValue.increment(costUsd),
        currentMonthKey: monthKey,
        currentMonthCostUsd: sameMonth ? FieldValue.increment(costUsd) : costUsd,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('incrementUserCostDoc failed for', ref.path, err);
  }
}

// Global ledger tracks each cost category's current-month total separately
// (unlike the per-user doc's single combined currentMonthCostUsd, which is
// only ever shown as one number) - so "עלות AI" can keep showing the same
// extraction-vs-visual-match split for the current month that it always
// showed for the lifetime total. On a month rollover, whichever category's
// call happens to land first resets BOTH month fields (its own to this
// call's cost, the other to 0) - the other category may not fire again for
// a while, but its own "this month" total is still correctly zero either way.
async function incrementGlobalCostDoc(ref, field, costUsd, monthKey) {
  const monthField = field === 'aiCostUsd' ? 'currentMonthAiCostUsd' : 'currentMonthVisualMatchCostUsd';
  const otherMonthField = field === 'aiCostUsd' ? 'currentMonthVisualMatchCostUsd' : 'currentMonthAiCostUsd';
  try {
    const snap = await ref.get();
    const sameMonth = snap.exists && snap.data().currentMonthKey === monthKey;
    const updates = { [field]: FieldValue.increment(costUsd), currentMonthKey: monthKey, updatedAt: FieldValue.serverTimestamp() };
    updates[monthField] = sameMonth ? FieldValue.increment(costUsd) : costUsd;
    if (!sameMonth) updates[otherMonthField] = 0;
    await ref.set(updates, { merge: true });
  } catch (err) {
    console.error('incrementGlobalCostDoc failed for', ref.path, err);
  }
}

async function enforceAiRateLimit(uid) {
  const userSnap = await db.collection('users').doc(uid).get();
  const role = userSnap.exists ? userSnap.data().role : 'regular';
  if (role === 'admin' || role === 'editor') return;

  const ref = db.collection('aiRateLimits').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const now = Date.now();
    if (!data || now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }
    if (data.count >= RATE_LIMIT_MAX_CALLS) {
      throw new HttpsError('resource-exhausted', 'יותר מדי בקשות בזמן קצר. נסו שוב בעוד כמה דקות.');
    }
    tx.update(ref, { count: FieldValue.increment(1) });
  });
}

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
function estimateCostUsd(usage, priceInput, priceOutput) {
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

// --- Multi-provider vision model support ------------------------------
// The two AI calls that actually cost real money per report/match
// (extractReportFromImages and comparePhotoSimilarity, further down) can
// each be pointed at a different provider AND a specific model within it,
// chosen live in Settings > match parameters (see
// extractionProviderKind/extractionModel and
// photoCompareProviderKind/photoCompareModel in matchingEngine.js), not
// hardcoded here. Every adapter below takes the same generic shape (system
// prompt, text parts, image parts, a JSON schema written in Anthropic's own
// dialect - anyOf/type-array nulls, additionalProperties:false, since
// that's this app's original, richest target) and returns
// { parsed, costUsd, refused, truncated } - callers don't need to know
// which provider/model actually ran.
const PROVIDER_KINDS = {
  anthropic: { label: 'Claude', apiKeyField: null, defaultModel: 'claude-sonnet-5' },
  gemini: { label: 'Gemini', apiKeyField: 'geminiApiKey', defaultModel: 'gemini-2.5-flash' },
  openai: { label: 'OpenAI', apiKeyField: 'openaiApiKey', defaultModel: 'gpt-4o-mini' },
  fireworks: { label: 'Fireworks', apiKeyField: 'fireworksApiKey', defaultModel: 'accounts/fireworks/models/qwen2p5-vl-32b-instruct' },
};

// Known per-model pricing (per million tokens) for cost tracking - since the
// admin can pick ANY model a provider's live list returns (see
// listProviderModels below), not just these, an unrecognized choice falls
// back to DEFAULT_PRICE rather than silently recording $0 cost.
const PRICE_TABLE = {
  'anthropic:claude-sonnet-5': { priceIn: 3.0, priceOut: 15.0 },
  'anthropic:claude-haiku-4-5': { priceIn: 1.0, priceOut: 5.0 },
  'gemini:gemini-2.5-flash': { priceIn: 0.3, priceOut: 2.5 },
  'gemini:gemini-2.5-flash-lite': { priceIn: 0.1, priceOut: 0.4 },
  'openai:gpt-4o-mini': { priceIn: 0.15, priceOut: 0.6 },
  'fireworks:accounts/fireworks/models/qwen2p5-vl-32b-instruct': { priceIn: 0.9, priceOut: 0.9 },
};
const DEFAULT_PRICE = { priceIn: 1.0, priceOut: 5.0 };

// Claude's key is the one provider that stays a real Firebase secret (this
// path already worked before providers were switchable) - it throws the
// same kind of clear, specific error the Firestore-backed lookup below does
// if it's ever missing, rather than a bare "undefined" 401 from Anthropic.
function requireAnthropicSecret() {
  const value = process.env.ANTHROPIC_API_KEY;
  if (!value) {
    throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY לא מוגדר.');
  }
  return value;
}

// Every other provider's key is a plain field on config/aiProviderKeys (see
// aiProviderKeysApi.js) - a Firestore doc, not a Secret Manager secret,
// specifically so an admin can paste/replace a key from the settings screen
// itself, no redeploy or CLI access needed. A provider selected without its
// key ever having been saved throws a clear, specific error rather than
// silently falling back to another provider - a report that fails to
// auto-fill is a minor inconvenience; one silently produced by the wrong
// AI/cost line is worse.
async function requireProviderApiKey(fieldName, providerLabel) {
  const snap = await db.collection('config').doc('aiProviderKeys').get();
  const value = snap.exists ? snap.data()[fieldName] : '';
  if (!value) {
    throw new HttpsError('failed-precondition', `לא הוגדר מפתח API עבור ${providerLabel} - יש להוסיף אותו בהגדרות AI לפני שאפשר לבחור בו.`);
  }
  return value;
}

/**
 * Gemini's structured-output schema dialect doesn't support anyOf or a
 * type:[...] array the way Anthropic's/OpenAI's do - "nullable" is a
 * sibling flag on the type instead. This walks the same schema object every
 * other provider already uses and rewrites just those two null-union
 * patterns; everything else (enum, properties, items, required) passes
 * through unchanged. additionalProperties is stripped since Gemini's schema
 * has no such concept and rejects unrecognized keys.
 */
function toGeminiSchema(node) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node.anyOf)) {
    const nonNull = node.anyOf.find((b) => b.type !== 'null') || {};
    const hasNull = node.anyOf.some((b) => b.type === 'null');
    const converted = toGeminiSchema(nonNull);
    return hasNull ? { ...converted, nullable: true } : converted;
  }
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'additionalProperties') continue;
    if (key === 'type' && Array.isArray(value)) {
      result.type = value.find((t) => t !== 'null');
      if (value.includes('null')) result.nullable = true;
      continue;
    }
    if (key === 'properties') {
      result.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toGeminiSchema(v)]));
      continue;
    }
    if (key === 'items') {
      result.items = toGeminiSchema(value);
      continue;
    }
    result[key] = value;
  }
  return result;
}

async function callAnthropicVision({ model, priceIn, priceOut, systemPrompt, textParts, imageParts, schema, maxTokens, thinking }) {
  const client = new Anthropic({ apiKey: requireAnthropicSecret() });
  const content = [
    ...imageParts.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.base64 } })),
    ...textParts.map((text) => ({ type: 'text', text })),
  ];
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    thinking: { type: thinking ? 'adaptive' : 'disabled' },
    system: systemPrompt,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No result returned.');
  const inputTokens = (response.usage?.input_tokens || 0) + (response.usage?.cache_creation_input_tokens || 0);
  const cacheReadTokens = response.usage?.cache_read_input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const costUsd = (inputTokens * priceIn) / 1e6 + (cacheReadTokens * priceIn * 0.1) / 1e6 + (outputTokens * priceOut) / 1e6;
  return {
    parsed: JSON.parse(textBlock.text),
    costUsd,
    refused: response.stop_reason === 'refusal',
    truncated: response.stop_reason === 'max_tokens',
  };
}

async function callGeminiVision({ model, priceIn, priceOut, systemPrompt, textParts, imageParts, schema, maxTokens }) {
  const apiKey = await requireProviderApiKey('geminiApiKey', 'Gemini');
  const parts = [
    ...imageParts.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
    ...textParts.map((text) => ({ text })),
  ];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const finishReason = data.candidates?.[0]?.finishReason;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
  return {
    parsed: JSON.parse(text),
    costUsd: (inputTokens * priceIn) / 1e6 + (outputTokens * priceOut) / 1e6,
    refused: finishReason === 'SAFETY',
    truncated: finishReason === 'MAX_TOKENS',
  };
}

// Shared by OpenAI and Fireworks - both expose an OpenAI-compatible chat
// completions endpoint. strictSchema uses OpenAI's own schema-validated
// json_schema mode (well-supported there); Fireworks' hosted open-weight
// model has no such guarantee, so it instead gets a loose json_object mode
// plus the schema spelled out in the system prompt as an instruction - a
// deliberately less strict fallback for a provider with no official
// schema-conformance guarantee.
async function callOpenAiCompatibleVision({
  apiUrl,
  apiKeyField,
  providerLabel,
  model,
  priceIn,
  priceOut,
  systemPrompt,
  textParts,
  imageParts,
  schema,
  maxTokens,
  strictSchema,
}) {
  const apiKey = await requireProviderApiKey(apiKeyField, providerLabel);
  const content = [
    ...textParts.map((text) => ({ type: 'text', text })),
    ...imageParts.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })),
  ];
  const responseFormat = strictSchema
    ? { type: 'json_schema', json_schema: { name: 'extraction', strict: true, schema } }
    : { type: 'json_object' };
  const system = strictSchema
    ? systemPrompt
    : `${systemPrompt}\n\nהשיבו אך ורק באובייקט JSON יחיד, ללא טקסט נוסף, התואם בדיוק לסכימה הבאה:\n${JSON.stringify(schema)}`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      response_format: responseFormat,
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  return {
    parsed: JSON.parse(choice?.message?.content || '{}'),
    costUsd: (inputTokens * priceIn) / 1e6 + (outputTokens * priceOut) / 1e6,
    refused: choice?.finish_reason === 'content_filter',
    truncated: choice?.finish_reason === 'length',
  };
}

/**
 * Dispatches one vision+structured-JSON call to whichever provider+model is
 * currently selected for this task - the one place that needs to know all
 * four provider kinds exist. Falls back to the anthropic default for an
 * unrecognized/unset kind (e.g. before the config doc has ever been saved).
 */
async function callVisionModel(providerKind, model, args) {
  const kind = PROVIDER_KINDS[providerKind] ? providerKind : 'anthropic';
  const resolvedModel = model || PROVIDER_KINDS[kind].defaultModel;
  const price = PRICE_TABLE[`${kind}:${resolvedModel}`] || DEFAULT_PRICE;
  const common = { model: resolvedModel, priceIn: price.priceIn, priceOut: price.priceOut, ...args };
  switch (kind) {
    case 'anthropic':
      return callAnthropicVision(common);
    case 'gemini':
      return callGeminiVision(common);
    case 'openai':
      return callOpenAiCompatibleVision({
        ...common,
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKeyField: 'openaiApiKey',
        providerLabel: PROVIDER_KINDS.openai.label,
        strictSchema: true,
      });
    case 'fireworks':
      return callOpenAiCompatibleVision({
        ...common,
        apiUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
        apiKeyField: 'fireworksApiKey',
        providerLabel: PROVIDER_KINDS.fireworks.label,
        strictSchema: false,
      });
    default:
      throw new HttpsError('internal', `Unknown provider kind: ${kind}`);
  }
}

/** Reads the admin-selected provider kind + model for one task (config/matchWeights.{kindField}/{modelField}), falling back to defaults. */
async function getSelectedProviderModel(kindField, modelField) {
  const snap = await db.collection('config').doc('matchWeights').get();
  const data = snap.exists ? snap.data() : {};
  const kind = PROVIDER_KINDS[data[kindField]] ? data[kindField] : 'anthropic';
  const model = data[modelField] || PROVIDER_KINDS[kind].defaultModel;
  return { kind, model };
}

/**
 * Admin-only: fetches the live list of available models for one provider,
 * using either the key passed in from the (possibly not-yet-saved) settings
 * form, or - for Claude - the ANTHROPIC_API_KEY secret directly, since that
 * one is never typed into a form field. Lets the settings screen's "רענון
 * רשימה" button show what a provider actually currently offers instead of a
 * small hand-maintained fallback list.
 */
export const listProviderModels = onCall({ region: 'me-west1', cors: true, secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists || callerSnap.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'מנהלים בלבד.');
  }

  const providerKind = request.data?.providerKind;
  if (!PROVIDER_KINDS[providerKind]) {
    throw new HttpsError('invalid-argument', 'ספק לא מוכר.');
  }
  const apiKey = providerKind === 'anthropic' ? process.env.ANTHROPIC_API_KEY : request.data?.apiKey;
  if (!apiKey) {
    throw new HttpsError('invalid-argument', 'נדרש מפתח API כדי לקבל רשימת מודלים.');
  }

  try {
    if (providerKind === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      return { models: (data.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id })) };
    }
    if (providerKind === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const models = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .filter((m) => !/embedding|aqa|imagen|veo/i.test(m.name))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
      return { models };
    }
    if (providerKind === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const models = (data.data || [])
        .filter((m) => /^(gpt-|o[1-9]|chatgpt)/i.test(m.id))
        .filter((m) => !/embedding|whisper|tts|dall-e|moderation/i.test(m.id))
        .map((m) => ({ id: m.id, label: m.id }));
      return { models };
    }
    // fireworks
    const res = await fetch('https://api.fireworks.ai/inference/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const models = (data.data || []).filter((m) => /vl|vision|vlm/i.test(m.id)).map((m) => ({ id: m.id, label: m.id }));
    return { models };
  } catch (err) {
    console.error('listProviderModels failed', providerKind, err);
    throw new HttpsError('internal', 'לא ניתן היה לקבל רשימת מודלים - בדקו שהמפתח תקין.');
  }
});

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
  { region: 'me-west1', cors: true, secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    await enforceAiRateLimit(request.auth.uid);

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
      await recordCost(request.auth.uid, 'aiCostUsd', parsed._aiUsage.estimatedCostUsd);
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
  // ANTHROPIC_API_KEY is the only real Firebase secret here - every other
  // provider's key lives in Firestore instead (see requireProviderApiKey
  // above), so switching extractionProvider needs no redeploy.
  { region: 'me-west1', cors: true, secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    await enforceAiRateLimit(request.auth.uid);

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
    // The cap here used to be 4000 chars - low enough that a genuinely long
    // post (backstory + appeal + hashtags + contact info as the very last
    // line) got cut before ever reaching the model, silently dropping
    // whatever came after - including, worst case, the phone number this
    // whole field exists to rescue in the first place. 20000 covers any
    // real post with room to spare; still bounded so a pasted full webpage
    // or similar degenerate input doesn't balloon token cost unbounded.
    const postText = typeof request.data?.postText === 'string' ? request.data.postText.slice(0, 20000) : '';

    const imageParts = images.map((img) => ({ mimeType: img.mimeType || 'image/jpeg', base64: img.base64 }));

    // Computed fresh per request, not baked into the static system prompt -
    // a warm function instance can stay alive for hours/days between cold
    // starts, so "today" has to come from the request, not module load time.
    const todayIso = new Date().toISOString().slice(0, 10);
    const textParts = [
      ...(postText
        ? [
            `Additional text shared alongside the screenshot(s) - this is the post's own caption/link text and may include content cut off in the image (e.g. "...עוד"). Prefer it over the image where they overlap:\n${postText}`,
          ]
        : []),
      `Today's date is ${todayIso}. Extract the fields from this post.`,
    ];

    const { kind: providerKind, model } = await getSelectedProviderModel('extractionProviderKind', 'extractionModel');
    let result;
    try {
      result = await callVisionModel(providerKind, model, {
        systemPrompt: SYSTEM_PROMPTS_BY_SPECIES[species],
        textParts,
        imageParts,
        schema: SCHEMAS_BY_SPECIES[species],
        maxTokens: 4096,
        // Bounded visual classification into a fixed schema, not open-ended
        // judgment - extended reasoning is real extra time/cost this task
        // doesn't need (Anthropic-only knob; other providers ignore it).
        thinking: false,
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('extractReportFromImages failed', providerKind, model, err);
      throw new HttpsError('internal', 'Could not process the extraction request.');
    }

    if (result.refused) {
      throw new HttpsError('aborted', 'The image could not be processed.');
    }
    if (result.truncated) {
      throw new HttpsError('resource-exhausted', 'The extracted text was too long to complete.');
    }

    const parsed = result.parsed;
    // Cheap to log, useful when a main-photo crop comes out wrong - lets us
    // check what box the model actually returned without guessing.
    console.log('mainPhotoRegion:', JSON.stringify(parsed.mainPhotoRegion));
    // Real per-call cost from the provider's own usage figures, carried back
    // to the client so it can accumulate onto the resulting record - this
    // (plus visual-match cost) is the whole AI cost picture.
    parsed._aiUsage = { estimatedCostUsd: result.costUsd };
    await recordCost(request.auth.uid, 'aiCostUsd', result.costUsd);
    return parsed;
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
export const fetchFacebookLinkPreview = onCall({ region: 'me-west1', cors: true, timeoutSeconds: 30 }, async (request) => {
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
  // Loaded lazily, only here where it's actually used - sharp's native
  // binding load is real cold-start weight every other function in this
  // file (detectPetSpecies, extractReportFromImages, uploadReportPhoto,
  // fetchFacebookLinkPreview) would otherwise pay on every cold start for
  // no reason, since a static top-level import runs for every function's
  // own container regardless of whether that function ever touches it.
  const sharp = (await import('sharp')).default;
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
export const generatePhotoThumbnail = onCall({ region: 'me-west1', cors: true, timeoutSeconds: 60 }, async (request) => {
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

const UPLOAD_FOLDER_BY_RECORD_TYPE = { lost: 'lost-cases', found: 'found-reports' };
const COLLECTION_BY_RECORD_TYPE = { lost: 'lostCases', found: 'foundReports' };
const OWNER_FIELD_BY_RECORD_TYPE = { lost: 'ownerId', found: 'reportedByUid' };

/**
 * Writes a compressed photo (and optionally its thumbnail) into Storage on
 * the client's behalf, after checking ownership with a direct Admin SDK
 * read - not storage.rules' own firestore.get() cross-service check, which
 * in practice lagged behind a record's own creation write far more than a
 * short client-side retry could reliably outrun (a brand-new record's
 * first photo upload happens the instant after that record is created,
 * which is exactly when that lag bites hardest). This read has no such
 * lag: it's the same Admin SDK read the rest of this file already uses.
 * Compression itself still happens client-side (see uploadPhotos.js) -
 * only the authorization-sensitive write moved here.
 */
export const uploadReportPhoto = onCall({ region: 'me-west1', cors: true, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const { recordType, recordId, path, base64, thumbPath, thumbBase64 } = request.data || {};
  const folder = UPLOAD_FOLDER_BY_RECORD_TYPE[recordType];
  if (!folder || typeof recordId !== 'string' || typeof path !== 'string' || typeof base64 !== 'string') {
    throw new HttpsError('invalid-argument', 'recordType, recordId, path and base64 are required.');
  }
  // The client picks the exact filenames (see uploadPhotos.js), but they
  // must actually live under this record's own folder - proving ownership
  // of the record above says nothing about an arbitrary path elsewhere in
  // the bucket.
  const expectedPrefix = `${folder}/${recordId}/`;
  if (!path.startsWith(expectedPrefix) || (thumbPath && !thumbPath.startsWith(expectedPrefix))) {
    throw new HttpsError('invalid-argument', 'path does not belong to this record.');
  }

  const recordSnap = await db.collection(COLLECTION_BY_RECORD_TYPE[recordType]).doc(recordId).get();
  if (!recordSnap.exists) {
    throw new HttpsError('not-found', 'הרשומה לא נמצאה.');
  }
  if (recordSnap.data()[OWNER_FIELD_BY_RECORD_TYPE[recordType]] !== request.auth.uid) {
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const role = userSnap.exists ? userSnap.data().role : 'regular';
    if (role !== 'admin' && role !== 'editor') {
      throw new HttpsError('permission-denied', 'אין לך הרשאה להעלות תמונות לרשומה הזו.');
    }
  }

  const bucket = getStorage().bucket();
  const url = await uploadThumbnail(bucket, path, Buffer.from(base64, 'base64'));
  const result = { path, url };
  if (thumbBase64 && thumbPath) {
    result.thumbPath = thumbPath;
    result.thumbUrl = await uploadThumbnail(bucket, thumbPath, Buffer.from(thumbBase64, 'base64'));
  }
  return result;
});

// This call's provider/model/pricing now comes from PROVIDER_KINDS/PRICE_TABLE
// (see photoCompareProviderKind/photoCompareModel in matchingEngine.js/
// matchConfigApi.js, admin-selectable in Settings), not a constant here.
// Historical note: it ran on claude-haiku-4-5 once, before
// this was configurable, and was upgraded to Sonnet after two confirmed
// cases of confidently wrong verdicts - not vague hedging, but flatly
// misdescribing a photo (missing an obvious orange patch covering a cat's
// whole head/ears) even after two rounds of prompt tuning aimed at exactly
// that failure mode. A wrong "noMatch" silently zeroes out a real match's
// score, so accuracy matters more here than on the cheap, high-volume
// species-detect call above - worth remembering before picking a cheaper
// provider for this specific task.

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
  { region: 'me-west1', cors: true, secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    await enforceAiRateLimit(request.auth.uid);

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

    // Read live from Firestore, same doc the admin's matching-parameters
    // screen edits (photoCompareProviderKind/photoCompareModel/
    // photoCompareThinking in matchingEngine.js/matchConfigApi.js) - so
    // switching provider/model or toggling thinking in Settings takes
    // effect immediately for every caller, no redeploy needed. Thinking off
    // by default: it bills at the same rate as the answer itself and was
    // the single biggest driver of this app's AI spend; on is the fallback
    // if disabling it measurably brings back wrong verdicts.
    const matchConfigSnap = await db.collection('config').doc('matchWeights').get();
    const matchConfigData = matchConfigSnap.exists ? matchConfigSnap.data() : {};
    const useThinking = !!matchConfigData.photoCompareThinking;
    const providerKind = PROVIDER_KINDS[matchConfigData.photoCompareProviderKind] ? matchConfigData.photoCompareProviderKind : 'anthropic';
    const model = matchConfigData.photoCompareModel || PROVIDER_KINDS[providerKind].defaultModel;

    let result;
    try {
      result = await callVisionModel(providerKind, model, {
        systemPrompt: PHOTO_SIMILARITY_PROMPT,
        textParts: ['תמונה מדיווח על חיה אבודה:', 'תמונה מדיווח על חיה שנמצאה/נראתה:'],
        imageParts: [lostImage, foundImage],
        schema: PHOTO_SIMILARITY_SCHEMA,
        maxTokens: 1200,
        thinking: useThinking,
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('comparePhotoSimilarity failed', providerKind, model, err);
      throw new HttpsError('internal', 'Could not process the comparison request.');
    }

    const parsed = result.parsed;
    // Lets the client tell a verdict produced under a since-changed
    // provider/model apart from one still matching the currently selected
    // combo - see isVisualSimilarityStale in matchingApi.js, which
    // otherwise has no way to know a verdict came from a different
    // (possibly less reliable, or just differently-tuned) provider/model
    // than the one currently selected.
    parsed.providerModel = `${providerKind}:${model}`;
    parsed._aiUsage = { estimatedCostUsd: result.costUsd };
    await recordCost(request.auth.uid, 'visualMatchCostUsd', result.costUsd);
    return parsed;
  }
);

// Must match defaultArchiveCutoffDate in SettingsPage.jsx - the manual
// "מחיקת רשומות ישנות" button and this weekly run are the same process, on
// the same age threshold, one just runs itself automatically.
const CLEANUP_MAX_AGE_DAYS = 30;

function isRecordActive(status) {
  return (status || 'active') === 'active';
}

async function deleteStoragePhotos(bucket, photos) {
  await Promise.all(
    (photos || [])
      .flatMap((p) => [
        p.path ? bucket.file(p.path).delete().catch(() => {}) : null,
        p.thumbPath ? bucket.file(p.thumbPath).delete().catch(() => {}) : null,
      ])
      .filter(Boolean)
  );
}

/**
 * Server-side mirror of deleteLostCase/deleteFoundReport in the client's
 * lostReportApi.js/foundReportApi.js (same three steps: matches
 * subcollection, Storage photos, the record doc itself) - can't import
 * client code into a Cloud Function, so this is kept in sync by hand, same
 * pattern as the AI schema/color lists earlier in this file.
 */
async function deleteRecordAdmin(bucket, recordType, docId, photos) {
  if (recordType === 'lost') {
    const matchesSnap = await db.collection(COLLECTION_BY_RECORD_TYPE.lost).doc(docId).collection('matches').get();
    if (!matchesSnap.empty) {
      const batch = db.batch();
      matchesSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteStoragePhotos(bucket, photos);
  await db.collection(COLLECTION_BY_RECORD_TYPE[recordType]).doc(docId).delete();
}

/**
 * Weekly, unattended equivalent of the "מחיקת רשומות ישנות" button in
 * Settings (see archiveOldRecordsApi.js) - same rule (active records only,
 * never touched a real closed outcome, older than CLEANUP_MAX_AGE_DAYS),
 * just running itself on a schedule instead of needing an admin to
 * remember to click it. The permanent lifetimeStats counters (see
 * lifetimeStatsApi.js) were already incremented when each record was first
 * created/closed, so nothing here needs to touch them - the audit trail
 * survives this deletion the same way it does the manual button.
 */
export const weeklyCleanupOldRecords = onSchedule(
  { schedule: 'every sunday 03:00', timeZone: 'Asia/Jerusalem', region: 'me-west1' },
  async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CLEANUP_MAX_AGE_DAYS);

    const [lostSnap, foundSnap] = await Promise.all([
      db.collection(COLLECTION_BY_RECORD_TYPE.lost).get(),
      db.collection(COLLECTION_BY_RECORD_TYPE.found).get(),
    ]);
    const qualifies = (data) => {
      if (!isRecordActive(data.status)) return false;
      const created = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      return created !== null && created < cutoff;
    };
    const oldLostCases = lostSnap.docs.filter((d) => qualifies(d.data()));
    const oldFoundReports = foundSnap.docs.filter((d) => qualifies(d.data()));

    const bucket = getStorage().bucket();
    for (const d of oldLostCases) {
      await deleteRecordAdmin(bucket, 'lost', d.id, d.data().photos);
    }
    for (const d of oldFoundReports) {
      await deleteRecordAdmin(bucket, 'found', d.id, d.data().photos);
    }

    console.log(
      `weeklyCleanupOldRecords: deleted ${oldLostCases.length} lost cases, ${oldFoundReports.length} found reports (cutoff ${cutoff.toISOString()})`
    );
  }
);

/**
 * One-time, admin-only move to the monthly cost-tracking model (see
 * recordCost above): computes the site-wide lifetime AI total the same way
 * the old cost dashboard always had (summing aiCostUsd/visualMatchCostUsd
 * straight off every lostCases/foundReports record - a plain full-
 * collection read is fine here specifically because this runs exactly
 * once, never as a live page load), writes it into config/costLedger as
 * the starting lifetime total, and starts the current calendar month at
 * exactly $0. Also resets every existing userCosts/{uid} doc's own
 * currentMonthCostUsd to $0 for the same reason - their lifetime totals
 * need no change, they already correctly include everything up to today.
 * Refuses to run a second time (config/costLedger already existing means
 * this already happened) so an accidental re-click can't wipe out a real
 * month of already-tracked spend back to zero.
 */
export const migrateCostTrackingToMonthly = onCall({ region: 'me-west1', cors: true, timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists || callerSnap.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'מנהלים בלבד.');
  }

  const ledgerRef = db.collection('config').doc('costLedger');
  const existingLedger = await ledgerRef.get();
  if (existingLedger.exists) {
    throw new HttpsError('failed-precondition', 'המעבר למעקב חודשי כבר בוצע.');
  }

  const [lostSnap, foundSnap] = await Promise.all([db.collection('lostCases').get(), db.collection('foundReports').get()]);
  let aiCostUsd = 0;
  let visualMatchCostUsd = 0;
  lostSnap.docs.forEach((d) => {
    aiCostUsd += d.data().aiCostUsd || 0;
    visualMatchCostUsd += d.data().visualMatchCostUsd || 0;
  });
  foundSnap.docs.forEach((d) => {
    aiCostUsd += d.data().aiCostUsd || 0;
  });

  const monthKey = new Date().toISOString().slice(0, 7);
  await ledgerRef.set({
    aiCostUsd,
    visualMatchCostUsd,
    currentMonthKey: monthKey,
    currentMonthAiCostUsd: 0,
    currentMonthVisualMatchCostUsd: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const userCostsSnap = await db.collection('userCosts').get();
  for (let i = 0; i < userCostsSnap.docs.length; i += 400) {
    const batch = db.batch();
    userCostsSnap.docs.slice(i, i + 400).forEach((d) => {
      batch.set(d.ref, { currentMonthKey: monthKey, currentMonthCostUsd: 0 }, { merge: true });
    });
    await batch.commit();
  }

  return { aiCostUsd, visualMatchCostUsd, usersReset: userCostsSnap.size };
});
