import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyAxwFluCmTecbS99jE2V9vhxhgeIcNYf4E',
  authDomain: 'foufou-pets.firebaseapp.com',
  projectId: 'foufou-pets',
  storageBucket: 'foufou-pets.firebasestorage.app',
  messagingSenderId: '400449270879',
  appId: '1:400449270879:web:36d5d24515f3d9afe117ea',
};

const app = initializeApp(firebaseConfig);

// Proves calls to the AI-calling Cloud Functions are actually coming from
// this real, deployed app - not a script replaying a stolen/copied auth
// token directly against the API. Own reCAPTCHA Enterprise key, registered
// against this project's own domains only (foufou-pets.web.app /
// foufou-pets.firebaseapp.com) - not shared with any other app. Activated
// here so real traffic starts carrying valid tokens; enforceAppCheck isn't
// turned on for the functions yet (see functions/index.js) until that's
// confirmed actually working in the Firebase console's App Check metrics -
// enforcing before every client is sending tokens would lock out real users.
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider('6LcgL60tAAAAAFBZrKKHBLjPcFzUkKxJs1jDsM2B'),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Without this, Google silently reuses whichever Google account is already
// active in the browser and skips the account picker - which is exactly why
// "sign in with a different account" kept landing back on the same one.
// Forcing the chooser every time costs nothing for the normal single-account
// case (Google still remembers the last choice as the default).
googleProvider.setCustomParameters({ prompt: 'select_account' });
export const db = getFirestore(app);
export const storage = getStorage(app);
// me-west1 (Tel Aviv) - must match the region every function in
// functions/index.js is deployed to. Moved from europe-west1 for the real
// (if modest) latency win, since virtually every user is in Israel - the
// AI calls themselves still dominate actual wait time either way, since
// those still have to reach Anthropic's API regardless of which region
// this runs in.
export const functions = getFunctions(app, 'me-west1');
