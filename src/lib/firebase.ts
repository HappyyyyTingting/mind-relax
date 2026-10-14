import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// The Firebase web config is public (access is enforced by security rules),
// so it is safe to commit.
const app = initializeApp({
  apiKey: 'AIzaSyCm15oL5uc8tTUeZ8iQgKnSvqaoJMoa6IM',
  authDomain: 'mindrelax-app-2026.firebaseapp.com',
  projectId: 'mindrelax-app-2026',
  storageBucket: 'mindrelax-app-2026.firebasestorage.app',
  messagingSenderId: '878428029552',
  appId: '1:878428029552:web:b17f2c52077a7b6d06aab5',
});

export const auth = getAuth(app);
export const firestore = getFirestore(app);
