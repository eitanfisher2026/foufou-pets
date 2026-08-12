import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider, db } from '../../firebase.js';
import { COLLECTION as USERS_COLLECTION, ROLES, upsertUserOnLogin } from '../users/usersApi.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

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
      setRoleLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
  const signOut = () => firebaseSignOut(auth);
  const isAdmin = role === ROLES.ADMIN;
  const isEditorOrAdmin = role === ROLES.ADMIN || role === ROLES.EDITOR;

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithGoogle, signOut, role, roleLoading, isAdmin, isEditorOrAdmin }}
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
