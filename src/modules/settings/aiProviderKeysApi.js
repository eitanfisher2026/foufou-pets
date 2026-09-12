import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';

const DOC_PATH = ['config', 'aiProviderKeys'];

/**
 * Raw API keys for the non-Claude AI providers (Gemini/OpenAI/Fireworks) -
 * a plain Firestore document, not a Firebase secret, specifically so an
 * admin can paste/replace a key from this settings screen without needing
 * a redeploy or CLI access. firestore.rules restricts this doc to
 * admin-only read AND write (unlike most /config/{docId} docs, which any
 * signed-in user can read) - functions/index.js reads it server-side via
 * the Admin SDK regardless, which bypasses rules entirely. Claude's own key
 * stays a Firebase secret (ANTHROPIC_API_KEY) - that path already works and
 * isn't part of this doc.
 */
export async function getProviderKeys() {
  const snap = await getDoc(doc(db, ...DOC_PATH));
  const data = snap.exists() ? snap.data() : {};
  return {
    geminiApiKey: data.geminiApiKey || '',
    openaiApiKey: data.openaiApiKey || '',
    fireworksApiKey: data.fireworksApiKey || '',
  };
}

export async function setProviderKeys(keys) {
  await setDoc(doc(db, ...DOC_PATH), keys, { merge: true });
}
