import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "mock_api_key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "mock.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mock-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "mock-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1234:web:1234",
};

// Initialize Firebase safely for SSR/Next.js
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let auth: Auth | undefined;
let db: Firestore | undefined;
const googleProvider = new GoogleAuthProvider();

// Safe initialization (only active on client usually)
try {
   auth = getAuth(app);
   db = getFirestore(app);
} catch (e) {
   console.error("Firebase init error (SSR expected):", e);
}

export { app, auth, db, googleProvider };
