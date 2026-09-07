import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { SPECIES, COLLECTIONS } from '../shared/collections.js';

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
      // Which species this person is currently working in - a session-
      // persisted preference (saved on the profile, not just locally, so it
      // follows them across devices), not a permission. Defaults to cats,
      // the only species that existed before this field did.
      preferredSpecies: SPECIES.CAT,
      // Only ever written here, at the exact moment a profile doc is first
      // created - never touched again after that (see markOnboardingSeen
      // below, which flips it once the dialog is dismissed). That's what
      // makes "field missing" a safe way to mean "already onboarded" for
      // everyone who signed in before this existed: their doc was created
      // long before this line did, so it was never written for them at
      // all, and OnboardingDialog treats that the same as true.
      hasSeenOnboarding: false,
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

// "Disconnect" a user: removes their profile doc entirely, dropping them
// back to REGULAR (least privilege) the moment their role check next runs
// (AuthProvider's live subscription treats a missing doc the same as
// REGULAR) - so an admin/editor loses those permissions immediately even
// if they're mid-session right now. This doesn't block them from using the
// app at all, though: if they sign in again, upsertUserOnLogin (see above)
// just creates them a fresh REGULAR profile doc, same as any brand-new
// user - there's no "banned" state in this app, this only ever resets
// someone back to the default, it never locks them out.
export async function deleteUser(uid) {
  await deleteDoc(doc(db, COLLECTION, uid));
}

// Fulfills the privacy policy's "request deletion of your personal data"
// (see public/privacy.html) - unlike deleteUser above, which only ever
// touched their own profile doc, this clears the personal-contact fields
// (name/email/phone) off every lost case and found report they created,
// plus their name/email on every feedback thread they sent. Deliberately
// leaves the records themselves (photos, pet details, matches, message
// text) in place - those aren't this person's personal data, and other
// people still rely on that content (an active match, a support history)
// even once this person's own identifying info is gone from it. A single
// batch is safe at this app's scale (well under Firestore's 500-write
// limit for any one person's own records); would need chunking if that
// ever stopped being true.
export async function clearUserReference(uid) {
  const [lostCasesSnap, foundReportsSnap, feedbackSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.LOST_CASES), where('ownerId', '==', uid))),
    getDocs(query(collection(db, COLLECTIONS.FOUND_REPORTS), where('reportedByUid', '==', uid))),
    getDocs(query(collection(db, 'feedbackThreads'), where('userId', '==', uid))),
  ]);

  const batch = writeBatch(db);
  lostCasesSnap.docs.forEach((d) => {
    batch.update(d.ref, { ownerName: '', ownerEmail: '', contactName: '', contactPhone: '', normalizedPhone: '' });
  });
  foundReportsSnap.docs.forEach((d) => {
    batch.update(d.ref, { reporterName: '', reporterEmail: '', contactName: '', contactPhone: '', normalizedPhone: '' });
  });
  feedbackSnap.docs.forEach((d) => {
    batch.update(d.ref, { senderName: '', senderEmail: '' });
  });
  await batch.commit();

  return {
    lostCasesCleared: lostCasesSnap.docs.length,
    foundReportsCleared: foundReportsSnap.docs.length,
    feedbackThreadsCleared: feedbackSnap.docs.length,
  };
}

/** Self-service: marks the first-login onboarding dialog as seen, for good. */
export async function markOnboardingSeen(uid) {
  await setDoc(doc(db, COLLECTION, uid), { hasSeenOnboarding: true }, { merge: true });
}

/** Self-service: switches which species this person is currently working in. */
export async function updatePreferredSpecies(uid, species) {
  await setDoc(doc(db, COLLECTION, uid), { preferredSpecies: species }, { merge: true });
}
