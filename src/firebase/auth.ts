import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getServices } from './firebase';
import { AuthUser } from '../types';

export const AUTHORIZED_ADMIN_EMAIL = '20sgamingrohit@gmail.com';
const LEGACY_SESSION_KEY = 'creative_inventor_admin_session';
const LEGACY_VAULT_KEY = 'creative_inventor_admin_vault';

function clearLegacyStorage() {
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(LEGACY_VAULT_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function isAuthorizedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === AUTHORIZED_ADMIN_EMAIL.toLowerCase();
}

function mapFirebaseUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || 'Administrator',
    username: user.email || AUTHORIZED_ADMIN_EMAIL,
    photoURL: user.photoURL,
  };
}

/**
 * Signs in via Firebase Google Authentication (signInWithPopup).
 * Strictly restricts access to 20sgamingrohit@gmail.com only.
 * Any other Google account is immediately signed out and rejected.
 */
export async function loginWithGoogle(): Promise<AuthUser> {
  clearLegacyStorage();
  const { auth } = getServices();

  if (!auth) {
    throw new Error('Firebase Authentication is not initialized.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    if (!isAuthorizedEmail(user.email)) {
      await signOut(auth);
      throw new Error('You are not authorised for this access.');
    }

    return mapFirebaseUser(user);
  } catch (error: any) {
    const code = error?.code;

    if (error?.message === 'You are not authorised for this access.') {
      throw error;
    }

    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google sign-in was cancelled. Please try again.');
    }

    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Sign-in popup was blocked by your browser. Please allow popups for this website and try again.'
      );
    }

    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      throw new Error(
        `Domain "${host}" is not authorized in Firebase Authentication. Add it under Firebase Console -> Authentication -> Settings -> Authorized domains.`
      );
    }

    if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
      throw new Error(
        'Google Sign-In is not enabled in Firebase Console for project creative-inventor-a8723. Enable Authentication -> Sign-in method -> Google.'
      );
    }

    if (code === 'auth/network-request-failed') {
      throw new Error('Network error while connecting to Google Sign-In. Please check your internet connection.');
    }

    throw new Error(error?.message || 'Google Sign-In failed. Please try again.');
  }
}

export async function logoutAdmin(): Promise<void> {
  clearLegacyStorage();
  try {
    const { clearAllDriveTokens } = await import('./googleDrive');
    clearAllDriveTokens();
  } catch {
    // Ignore cleanup errors
  }
  const { auth } = getServices();
  if (auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('SignOut notice:', e);
    }
  }
}

/**
 * Subscribes to Firebase Authentication state.
 * Only permits the authorized Google account (20sgamingrohit@gmail.com).
 * Automatically signs out any unauthorized account.
 */
export function subscribeToAuth(
  callback: (user: AuthUser | null) => void,
  onUnauthorized?: (message: string) => void
): () => void {
  clearLegacyStorage();
  const { auth } = getServices();

  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (currentUser: User | null) => {
    if (!currentUser) {
      callback(null);
      return;
    }

    if (!isAuthorizedEmail(currentUser.email)) {
      try {
        await signOut(auth);
      } catch {
        // Ignore signOut failure
      }
      if (onUnauthorized) {
        onUnauthorized('You are not authorised for this access.');
      }
      callback(null);
      return;
    }

    callback(mapFirebaseUser(currentUser));
  });
}
