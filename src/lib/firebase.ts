import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase 客户端配置是公开信息（访问由安全规则控制），可直接入库。
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
