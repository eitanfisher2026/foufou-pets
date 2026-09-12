import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';

const DOC_PATH = ['config', 'aiProviderKeys'];

/**
 * Raw API keys for the non-Claude AI providers - the LLM ones (Gemini/
 * OpenAI/Fireworks) and the two embedding-based photo-comparison ones
 * (Jina/Voyage) - a plain Firestore document, not a Firebase secret,
 * specifically so an admin can paste/replace a key from this settings
 * screen without needing a redeploy or CLI access. firestore.rules
 * restricts this doc to admin-only read AND write (unlike most
 * /config/{docId} docs, which any signed-in user can read) -
 * functions/index.js reads it server-side via the Admin SDK regardless,
 * which bypasses rules entirely. Claude's own key stays a Firebase secret
 * (ANTHROPIC_API_KEY) - that path already works and isn't part of this doc.
 */
export async function getProviderKeys() {
  const snap = await getDoc(doc(db, ...DOC_PATH));
  const data = snap.exists() ? snap.data() : {};
  return {
    geminiApiKey: data.geminiApiKey || '',
    openaiApiKey: data.openaiApiKey || '',
    fireworksApiKey: data.fireworksApiKey || '',
    jinaApiKey: data.jinaApiKey || '',
    voyageApiKey: data.voyageApiKey || '',
  };
}

export async function setProviderKeys(keys) {
  await setDoc(doc(db, ...DOC_PATH), keys, { merge: true });
}

/**
 * Live model list for one provider, straight from that provider's own API -
 * used by the "רענון רשימה" button (see ProviderModelPicker.jsx) so a model
 * dropdown reflects what a provider currently actually offers, not just a
 * small hand-maintained fallback list. apiKey is the value currently typed
 * into the form (not necessarily saved yet, so a key can be tested before
 * committing to it) - omitted for Claude, whose key the function reads from
 * its own Firebase secret instead.
 */
export async function listProviderModels(providerKind, apiKey) {
  const call = httpsCallable(functions, 'listProviderModels');
  const result = await call({ providerKind, apiKey });
  return result.data.models;
}
