import { FirebaseConfig } from '../types';

// Web Client credentials registered for Firebase Project: creative-inventor-a8723
const PROJECT_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyDR9NE88FNE2ya4MW20BkyWzspjwCdKkQc',
  authDomain: 'creative-inventor-a8723.firebaseapp.com',
  projectId: 'creative-inventor-a8723',
  storageBucket: 'creative-inventor-a8723.firebasestorage.app',
  messagingSenderId: '1052164526097',
  appId: '1:1052164526097:web:f3cca774959b3a4355a1b0',
  measurementId: 'G-82H6F21X6Z',
};

export function getActiveFirebaseConfig(): FirebaseConfig {
  const envApiKey = (import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
  const envAuthDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  const envProjectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const envStorageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
  const envMessagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const envAppId = (import.meta.env.VITE_FIREBASE_APP_ID || '').trim();
  const envMeasurementId = (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '').trim();

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
    };
  }

  // Use registered Web App credentials for creative-inventor-a8723
  return PROJECT_CONFIG;
}

export function isFirebaseConfigured(): boolean {
  return true;
}

export function getMissingFirebaseEnvKeys(): string[] {
  return [];
}
