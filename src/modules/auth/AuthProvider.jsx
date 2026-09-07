import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider, db } from '../../firebase.js';
import {
  COLLECTION as USERS_COLLECTION,
  ROLES,
  upsertUserOnLogin,
  updatePreferredSpecies,
  markOnboardingSeen,
} from '../users/usersApi.js';
import { SPECIES } from '../shared/collections.js';

const AuthContext = createContext(null);

// Lets an admin preview the app the way a regular user actually sees it
// (no settings access, no admin-only controls) without touching their
// real role in Firestore - a per-device UI toggle, not a permission
// change, so it's stored in localStorage rather than the profile doc.
// Own key, unrelated to any other app.
const VIEW_AS_REGULAR_STORAGE_KEY = 'foufouPets:viewAsRegular';

function readViewingAsRegular() {
  try {
    return localStorage.getItem(VIEW_AS_REGULAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeViewingAsRegular(value) {
  try {
    if (value) localStorage.setItem(VIEW_AS_REGULAR_STORAGE_KEY, '1');
    else localStorage.removeItem(VIEW_AS_REGULAR_STORAGE_KEY);
  } catch {
    // Private browsing / storage blocked - the toggle just won't survive
    // a reload, not worth failing anything else over.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [preferredSpecies, setPreferredSpeciesState] = useState(SPECIES.CAT);
  // Defaults true ("already onboarded") for the brief window before the
  // live subscription below resolves - so a returning user's screen never
  // even flashes the onboarding dialog open. Only a genuinely brand-new
  // profile doc has this explicitly false (see upsertUserOnLogin).
  const [hasSeenOnboarding, setHasSeenOnboardingState] = useState(true);
  const [viewingAsRegular, setViewingAsRegular] = useState(readViewingAsRegular);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) upsertUserOnLogin(firebaseUser);
    });
    return unsubscribe;
  }, []);

  // Live subscription (not a one-off read) so an admin changing someone's
  // role takes effect immediately for that person, without requiring them
  // to sign out and back in. Falls back to REGULAR (least privilege) for
  // the brief window before upsertUserOnLogin's write lands, and stays
  // there if the profile doc is ever missing for some other reason.
  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    const unsubscribe = onSnapshot(doc(db, USERS_COLLECTION, user.uid), (snap) => {
      setRole(snap.exists() ? snap.data().role || ROLES.REGULAR : ROLES.REGULAR);
      setPreferredSpeciesState(snap.exists() ? snap.data().preferredSpecies || SPECIES.CAT : SPECIES.CAT);
      // ?? not || - false is a real, meaningful value here (unlike the
      // other two fields above, where "" or missing both mean "use the
      // default"), so it must not get coerced into the true default.
      setHasSeenOnboardingState(snap.exists() ? (snap.data().hasSeenOnboarding ?? true) : true);
      setRoleLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
  const signOut = () => firebaseSignOut(auth);
  // isRealAdmin is the actual Firestore role, never affected by the toggle -
  // it's what decides whether the toggle itself is even offered. isAdmin/
  // isEditorOrAdmin are what the rest of the app already checks everywhere
  // (RequireAdmin, ProfileMenu, the various admin-only buttons throughout)
  // - folding the simulation in here means every one of those existing
  // checks respects it automatically, with nothing else needing to change.
  const isRealAdmin = role === ROLES.ADMIN;
  const isAdmin = isRealAdmin && !viewingAsRegular;
  const isEditorOrAdmin = (role === ROLES.ADMIN || role === ROLES.EDITOR) && !viewingAsRegular;

  function toggleViewAsRegular() {
    setViewingAsRegular((prev) => {
      const next = !prev;
      writeViewingAsRegular(next);
      return next;
    });
  }
  // Optimistic local update (the live subscription above will confirm it
  // moments later) so switching species feels instant instead of waiting on
  // a round trip - saved to the profile, not just this device, so it's
  // still there next time this person signs in anywhere.
  function setPreferredSpecies(species) {
    setPreferredSpeciesState(species);
    if (user) updatePreferredSpecies(user.uid, species);
  }

  // Optimistic, same reasoning as setPreferredSpecies above - the dialog
  // closes immediately rather than waiting on the live subscription to
  // confirm the write.
  function dismissOnboarding() {
    setHasSeenOnboardingState(true);
    if (user) markOnboardingSeen(user.uid);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        signOut,
        role,
        roleLoading,
        isAdmin,
        isEditorOrAdmin,
        isRealAdmin,
        viewingAsRegular,
        toggleViewAsRegular,
        preferredSpecies,
        setPreferredSpecies,
        hasSeenOnboarding,
        dismissOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
