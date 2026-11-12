import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
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
  const config = getActiveFirebaseConfig();

  if (!config) {
    return { app: null, auth: null, db: null, storage: null };
  }

  try {
    if (getApps().length === 0) {
      appInstance = initializeApp(config);
    } else {
      appInstance = getApp();
    }

    if (!authInstance) authInstance = getAuth(appInstance);
    if (!dbInstance) dbInstance = getFirestore(appInstance);
    if (!storageInstance) storageInstance = getStorage(appInstance);

    return {
      app: appInstance,
      auth: authInstance,
      db: dbInstance,
      storage: storageInstance,
    };
  } catch (error) {
    console.warn('Firebase services initialization warning:', error);
    return { app: null, auth: null, db: null, storage: null };
  }
}

// Initial safe attempt
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
