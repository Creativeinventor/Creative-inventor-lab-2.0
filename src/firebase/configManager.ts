import appletConfig from '../../firebase-applet-config.json';
import { FirebaseConfig } from '../types';

// Web Client credentials registered for Firebase Project: creative-inventor-a8723 (used on custom domains like Vercel)
const PROJECT_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyDR9NE88FNE2ya4MW20BkyWzspjwCdKkQc',
  authDomain: 'creative-inventor-a8723.firebaseapp.com',
  projectId: 'creative-inventor-a8723',
  storageBucket: 'creative-inventor-a8723.firebasestorage.app',
  messagingSenderId: '1052164526097',
  appId: '1:1052164526097:web:f3cca774959b3a4355a1b0',
  measurementId: 'G-82H6F21X6Z',
};

export interface ExtendedFirebaseConfig extends FirebaseConfig {
  firestoreDatabaseId?: string;
}

export function isAiStudioOrLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.endsWith('.run.app') || host === 'localhost' || host === '127.0.0.1';
}

export function getProvisionedAppletConfig(): ExtendedFirebaseConfig {
  return {
    apiKey: appletConfig.apiKey,
    authDomain: appletConfig.authDomain,
    projectId: appletConfig.projectId,
    storageBucket: appletConfig.storageBucket,
    messagingSenderId: appletConfig.messagingSenderId,
    appId: appletConfig.appId,
    measurementId: appletConfig.measurementId || undefined,
    firestoreDatabaseId: (appletConfig as any).firestoreDatabaseId || undefined,
  };
}

export function getActiveFirebaseConfig(): ExtendedFirebaseConfig {
  const metaEnv: Record<string, string | undefined> =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as Record<string, string | undefined>)
      : {};
  const envApiKey = (metaEnv.VITE_FIREBASE_API_KEY || '').trim();
  const envAuthDomain = (metaEnv.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  const envProjectId = (metaEnv.VITE_FIREBASE_PROJECT_ID || '').trim();
  const envStorageBucket = (metaEnv.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
  const envMessagingSenderId = (metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const envAppId = (metaEnv.VITE_FIREBASE_APP_ID || '').trim();
  const envMeasurementId = (metaEnv.VITE_FIREBASE_MEASUREMENT_ID || '').trim();
  const envDatabaseId = (metaEnv.VITE_FIREBASE_DATABASE_ID || '').trim();

  // If environment variables are set and not placeholder templates, prioritize them
  if (
    envApiKey &&
    envProjectId &&
    !envApiKey.includes('YourFirebase') &&
    !envProjectId.includes('your-project')
  ) {
    return {
      apiKey: envApiKey,
      authDomain: envAuthDomain || `${envProjectId}.firebaseapp.com`,
      projectId: envProjectId,
      storageBucket: envStorageBucket || `${envProjectId}.firebasestorage.app`,
      messagingSenderId: envMessagingSenderId || PROJECT_CONFIG.messagingSenderId,
      appId: envAppId || PROJECT_CONFIG.appId,
      measurementId: envMeasurementId || PROJECT_CONFIG.measurementId,
      firestoreDatabaseId: envDatabaseId || undefined,
    };
  }

  // On AI Studio preview & localhost, use the provisioned Enterprise Firestore & Auth project
  if (isAiStudioOrLocalHost()) {
    return getProvisionedAppletConfig();
  }

  // On external custom domains (e.g. Vercel), use the registered Web App credentials
  return PROJECT_CONFIG;
}

export function isFirebaseConfigured(): boolean {
  return true;
}

export function getMissingFirebaseEnvKeys(): string[] {
  return [];
}
