import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getServices } from './firebase';
import { isFirebaseConfigured } from './configManager';
import { AuthUser } from '../types';

const DEFAULT_DOMAIN = import.meta.env.VITE_ADMIN_EMAIL_DOMAIN || 'creativeinventorlab.internal';
const DEMO_STORAGE_KEY = 'creative_inventor_demo_session';

export function usernameToEmail(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.includes('@')) {
    return trimmed;
  }
  return `${trimmed}@${DEFAULT_DOMAIN}`;
}

export async function loginAdmin(identifier: string, password: string): Promise<AuthUser> {
  const normalizedIdentifier = identifier.trim().toLowerCase();

  // ----------------------------------------------------
  // MODE A: DEMONSTRATION LOGIN (when Firebase is unconfigured)
  // ----------------------------------------------------
  if (!isFirebaseConfigured()) {
    if (normalizedIdentifier === 'admin' && password === '123') {
      const demoUser: AuthUser = {
        uid: 'demo-admin-id',
        email: 'admin@creativeinventorlab.internal',
        displayName: 'Lab Administrator (Demo Mode)',
        isDemo: true,
      };
      sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoUser));
      return demoUser;
    } else {
      throw new Error(
        'Invalid credentials. In Demonstration Mode, use User ID: admin and Password: 123 to log in.'
      );
    }
  }

  // ----------------------------------------------------
  // MODE B: REAL FIREBASE LOGIN (when Firebase is configured)
  // ----------------------------------------------------
  const { auth } = getServices();
  if (!auth) {
    throw new Error(
      'Firebase Authentication service could not be initialized. Check your Firebase project configuration.'
    );
  }

  const email = usernameToEmail(identifier);

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const u = userCredential.user;
    return {
      uid: u.uid,
      email: u.email,
      displayName: u.displayName || 'Lab Administrator',
      isDemo: false,
    };
  } catch (error: any) {
    const errorCode = error?.code;

    // Secure initial admin provisioning for real Firebase project:
    // If the account doesn't exist yet and admin attempts setup with initial credentials ('admin' / '123')
    if (
      (errorCode === 'auth/user-not-found' ||
        errorCode === 'auth/invalid-credential' ||
        errorCode === 'auth/invalid-login-credentials') &&
      normalizedIdentifier === 'admin' &&
      password === '123'
    ) {
      try {
        const newCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(newCredential.user, {
          displayName: 'Lab Administrator',
        });
        const u = newCredential.user;
        return {
          uid: u.uid,
          email: u.email,
          displayName: 'Lab Administrator',
          isDemo: false,
        };
      } catch (createError: any) {
        if (createError?.code === 'auth/email-already-in-use') {
          throw new Error(
            'Administrator account exists but password was incorrect. If you previously updated the password, please use your new password.'
          );
        } else if (createError?.code === 'auth/operation-not-allowed') {
          throw new Error(
            "Email/Password provider is not enabled in Firebase Console. Please go to Firebase Console -> Authentication -> Sign-in method and enable 'Email/Password'."
          );
        }
        throw new Error(
          `Firebase initial setup notice: ${createError?.message || 'Could not auto-create admin account'}. You can manually create user '${email}' with password '123' in Firebase Console -> Authentication -> Users.`
        );
      }
    }

    // Friendly error handling
    if (
      errorCode === 'auth/wrong-password' ||
      errorCode === 'auth/invalid-credential' ||
      errorCode === 'auth/invalid-login-credentials'
    ) {
      throw new Error(
        'Invalid User ID or password. If you previously updated your password, please use your new password.'
      );
    } else if (errorCode === 'auth/user-not-found') {
      throw new Error(
        `Administrator account '${email}' not found in Firebase. Please ensure the user is registered in Firebase Console -> Authentication -> Users, or log in with initial credentials 'admin' / '123' to initialize it.`
      );
    } else if (errorCode === 'auth/too-many-requests') {
      throw new Error('Access temporarily locked due to too many failed login attempts. Please wait a few moments.');
    } else if (errorCode === 'auth/network-request-failed') {
      throw new Error('Network error. Please check your internet connection and Firebase environment variables.');
    } else {
      throw new Error(error?.message || 'Authentication failed. Please verify credentials.');
    }
  }
}

export async function logoutAdmin(): Promise<void> {
  sessionStorage.removeItem(DEMO_STORAGE_KEY);
  const { auth } = getServices();
  if (auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('SignOut warning:', e);
    }
  }
}

export async function changeAdminPassword(newPassword: string): Promise<void> {
  if (newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  if (!isFirebaseConfigured()) {
    // In demo mode: confirm update for session
    return;
  }

  const { auth } = getServices();
  if (!auth || !auth.currentUser) {
    throw new Error('No administrator is currently authenticated.');
  }

  try {
    await updatePassword(auth.currentUser, newPassword);
  } catch (error: any) {
    if (error?.code === 'auth/requires-recent-login') {
      throw new Error('For security reasons, please log out and log in again before changing your password.');
    }
    throw new Error(error?.message || 'Failed to update administrator password.');
  }
}

export function getStoredDemoUser(): AuthUser | null {
  try {
    const saved = sessionStorage.getItem(DEMO_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return null;
}

export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void {
  // If in demo mode, check demo session
  if (!isFirebaseConfigured()) {
    const demoUser = getStoredDemoUser();
    callback(demoUser);
    return () => {};
  }

  const { auth } = getServices();
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (currentUser: User | null) => {
    if (currentUser) {
      callback({
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName || 'Lab Administrator',
        isDemo: false,
      });
    } else {
      callback(null);
    }
  });
}
