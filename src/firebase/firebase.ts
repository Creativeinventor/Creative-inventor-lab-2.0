import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './firebaseConfig';
import { getActiveFirebaseConfig } from './configManager';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

export function initializeFirebaseServices(): {
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  storage: FirebaseStorage | null;
} {
  try {
    // Use environment overrides if configured, otherwise use direct firebaseConfig
    const config = getActiveFirebaseConfig() || firebaseConfig;

    if (getApps().length === 0) {
      appInstance = initializeApp(config);
    } else {
      appInstance = getApp();
    }

    if (!authInstance && appInstance) authInstance = getAuth(appInstance);
    if (!dbInstance && appInstance) dbInstance = getFirestore(appInstance);
    if (!storageInstance && appInstance) storageInstance = getStorage(appInstance);
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }

  return {
    app: appInstance,
    auth: authInstance,
    db: dbInstance,
    storage: storageInstance,
  };
}

// Safe initial setup that never crashes module load
const initial = initializeFirebaseServices();
export const app = initial.app;
export const auth = initial.auth;
export const db = initial.db;
export const storage = initial.storage;

export function getServices() {
  if (!authInstance || !dbInstance || !storageInstance) {
    return initializeFirebaseServices();
  }
  return {
    app: appInstance,
    auth: authInstance,
    db: dbInstance,
    storage: storageInstance,
  };
}
