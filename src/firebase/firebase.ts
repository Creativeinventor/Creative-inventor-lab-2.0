import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './firebaseConfig';
import {
  getActiveFirebaseConfig,
  getProvisionedAppletConfig,
} from './configManager';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

let publicAppletAppInstance: FirebaseApp | null = null;
let publicAppletDbInstance: Firestore | null = null;

export function initializeFirebaseServices(): {
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  storage: FirebaseStorage | null;
} {
  try {
    const config = getActiveFirebaseConfig() || firebaseConfig;

    if (getApps().length === 0) {
      appInstance = initializeApp(config);
    } else {
      appInstance = getApp();
    }

    if (!authInstance && appInstance) authInstance = getAuth(appInstance);
    if (!dbInstance && appInstance) {
      dbInstance = config.firestoreDatabaseId
        ? getFirestore(appInstance, config.firestoreDatabaseId)
        : getFirestore(appInstance);
    }
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

/**
 * Returns the provisioned AI Studio Firestore database instance so public
 * Project files written from AI Studio can be read on any phone or domain.
 */
export function getProvisionedPublicDb(): Firestore | null {
  try {
    const active = getActiveFirebaseConfig();
    const provisioned = getProvisionedAppletConfig();

    if (
      active.projectId === provisioned.projectId &&
      active.firestoreDatabaseId === provisioned.firestoreDatabaseId &&
      dbInstance
    ) {
      return dbInstance;
    }

    if (publicAppletDbInstance) return publicAppletDbInstance;

    const appName = 'provisioned-public-reader';
    const existing = getApps().find((a) => a.name === appName);
    publicAppletAppInstance = existing || initializeApp(provisioned, appName);
    publicAppletDbInstance = provisioned.firestoreDatabaseId
      ? getFirestore(publicAppletAppInstance, provisioned.firestoreDatabaseId)
      : getFirestore(publicAppletAppInstance);
    return publicAppletDbInstance;
  } catch {
    return null;
  }
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
