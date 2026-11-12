import { FirebaseConfig } from '../types';

export function getActiveFirebaseConfig(): FirebaseConfig | null {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
  const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const storageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
  const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const appId = (import.meta.env.VITE_FIREBASE_APP_ID || '').trim();

  // If required keys are missing or still placeholder values
  if (!apiKey || !projectId || apiKey.includes('YourFirebase') || projectId.includes('your-project-id')) {
    return null;
  }

  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket || `${projectId}.firebasestorage.app`,
    messagingSenderId,
    appId,
  };
}

export function isFirebaseConfigured(): boolean {
  const config = getActiveFirebaseConfig();
  return Boolean(config && config.apiKey && config.projectId);
}

export function getMissingFirebaseEnvKeys(): string[] {
  const keys: (keyof FirebaseConfig)[] = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ];

  const envMapping: Record<keyof FirebaseConfig, string> = {
    apiKey: 'VITE_FIREBASE_API_KEY',
    authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID',
    storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'VITE_FIREBASE_APP_ID',
  };

  const missing: string[] = [];
  const config = getActiveFirebaseConfig();

  if (!config) {
    keys.forEach((k) => {
      const val = import.meta.env[envMapping[k]];
      if (!val || val.includes('YourFirebase') || val.includes('your-project')) {
        missing.push(envMapping[k]);
      }
    });
  }

  return missing;
}
