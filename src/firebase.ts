/**
 * @file src/firebase.ts
 * Firebase initialization, authentication, and hardened Firestore client.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInAnonymously,
  updateProfile,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfigFile from '../firebase-applet-config.json';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigFile.projectId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigFile.appId || '',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigFile.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigFile.authDomain || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigFile.storageBucket || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigFile.messagingSenderId || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigFile.measurementId || '',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigFile.firestoreDatabaseId || '(default)',
  oAuthClientId: import.meta.env.VITE_FIREBASE_OAUTH_CLIENT_ID || firebaseConfigFile.oAuthClientId || '',
  recaptchaSiteKey: import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY || firebaseConfigFile.recaptchaSiteKey || '',
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  console.warn('Firebase client config is incomplete. Set VITE_FIREBASE_* values in your environment or update firebase-applet-config.json.');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// CRITICAL: Must pass the firestoreDatabaseId from firebaseConfig
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
export const firebaseProjectId = firebaseConfig.projectId;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Standard error handler conforming to FirestoreErrorInfo contract
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Sign in with Google popup
 */
export async function signInWithGoogle() {
  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google Sign-in failed:', error);
    throw error;
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, pass: string) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    return cred.user;
  } catch (error) {
    console.error('Email sign-in failed:', error);
    throw error;
  }
}

/**
 * Register a new user with email, password, and optional display name
 */
export async function signUpWithEmail(email: string, pass: string, displayName?: string) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    if (displayName && cred.user) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    return cred.user;
  } catch (error) {
    console.error('Email sign-up failed:', error);
    throw error;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email: string) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    console.error('Password reset failed:', error);
    throw error;
  }
}

/**
 * Sign in as an anonymous guest
 */
export async function signInAsGuest() {
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (error) {
    console.error('Guest sign-in failed:', error);
    throw error;
  }
}

/**
 * Formats Firebase auth error codes into readable messages
 */
export function formatAuthError(error: any): string {
  if (!error) return 'An unknown error occurred.';
  const code = error.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'The email address is improperly formatted.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact security admin.';
    case 'auth/user-not-found':
      return 'No account exists with this email address. Please sign up first.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid credentials. Please verify your email and password.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/operation-not-allowed':
      return 'This authentication method is currently not enabled.';
    case 'auth/unauthorized-domain': {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'your deployed hostname';
      return `Firebase is blocking sign-in from "${hostname}". Add this hostname in Firebase Console under Authentication → Settings → Authorized domains, then reload the page.`;
    }
    case 'auth/weak-password':
      return 'Password is too weak. Please choose at least 6 characters.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before finishing.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by the browser. Please allow popups for authentication.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Access temporarily restricted. Try again later.';
    default:
      return error.message || 'Authentication error. Please try again.';
  }
}

/**
 * Sign out current user
 */
export async function logOut() {
  await fbSignOut(auth);
}
