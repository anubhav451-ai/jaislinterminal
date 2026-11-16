import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Web config of the Firebase project (public by design; the data is protected by firestore.rules)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCi5hE5cW-b226vmLUI03gEwvyJuR76B0Y',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'jaislin-terminal.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'jaislin-terminal',
  storageBucket: 'jaislin-terminal.firebasestorage.app',
  messagingSenderId: '1096035144460',
  appId: '1:1096035144460:web:4a17d9a31243ca93152f29',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
