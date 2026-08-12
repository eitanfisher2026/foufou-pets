import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';

export const COLLECTION = 'users';

export const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  REGULAR: 'regular',
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'מנהל/ת',
  [ROLES.EDITOR]: 'עורך/ת',
  [ROLES.REGULAR]: 'רגיל/ה',
};

// Settings (where roles get managed) is admin-only, which creates a
// bootstrapping problem: nobody starts as admin, so nobody could ever
// reach the page that lets someone become one. Solved by recognizing one
// known identity as admin the very first time their profile doc is ever
// created - firestore.rules enforces the same email match on the create
// write itself, so this isn't just a client-side suggestion.
const BOOTSTRAP_ADMIN_EMAIL = 'eitanfisher100@gmail.com';

/**
 * Called once per sign-in (see AuthProvider) - creates the user's profile
 * doc the first time they ever sign in (REGULAR, except the bootstrap
 * admin above; anyone else is promoted afterward via the users settings
 * page, never the client itself), or just refreshes lastLoginAt/
 * displayName/photoURL on every later sign-in without touching their
 * existing role.
 */
export async function upsertUserOnLogin(firebaseUser) {
  const ref = doc(db, COLLECTION, firebaseUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || '',
      photoURL: firebaseUser.photoURL || '',
      role: firebaseUser.email === BOOTSTRAP_ADMIN_EMAIL ? ROLES.ADMIN : ROLES.REGULAR,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    return;
  }

  await setDoc(
    ref,
    {
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || '',
      photoURL: firebaseUser.photoURL || '',
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Admin-only: full user list for the users settings page. */
export async function listUsers() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Admin-only: promotes/demotes one user. */
export async function updateUserRole(uid, role) {
  await setDoc(doc(db, COLLECTION, uid), { role }, { merge: true });
}
