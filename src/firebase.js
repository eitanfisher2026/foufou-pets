import { initializeApp } from 'firebase/app';
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

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');
