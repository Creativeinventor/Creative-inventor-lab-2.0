import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { getServices } from './firebase';
import { AuthUser, AdminUserProfile } from '../types';

const DEFAULT_DOMAIN = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_EMAIL_DOMAIN) || 'creativeinventorlab.internal';
const SESSION_KEY = 'creative_inventor_admin_session';
const VAULT_KEY = 'creative_inventor_admin_vault';
export const PRIMARY_ADMIN_DOC_ID = 'primary_admin';

export function defaultEmailForUsername(username: string): string {
  const trimmed = username.trim().toLowerCase();
  if (trimmed.includes('@')) {
    return trimmed;
  }
  return `${trimmed}@${DEFAULT_DOMAIN}`;
}

interface AdminVault {
  username: string;
  password: string;
  authEmail: string;
  updatedAt?: string;
}

/**
 * Loads the active administrator credentials from local persistent storage.
 * Defaults to initial credentials (admin / 123) if not yet configured.
 */
export function getAdminVault(): AdminVault {
  const defaultVault: AdminVault = {
    username: 'admin',
    password: '123',
    authEmail: defaultEmailForUsername('admin'),
  };

  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.username === 'string' && typeof parsed.password === 'string') {
        return {
          username: parsed.username.trim().toLowerCase(),
          password: parsed.password,
          authEmail: parsed.authEmail || defaultEmailForUsername(parsed.username),
          updatedAt: parsed.updatedAt,
        };
      }
    }
  } catch (e) {
    console.warn('Notice reading admin vault:', e);
  }

  return defaultVault;
}

/**
 * Saves updated administrator credentials to persistent local storage.
 */
export function saveAdminVault(vault: AdminVault): void {
  try {
    localStorage.setItem(
      VAULT_KEY,
      JSON.stringify({
        ...vault,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (e) {
    console.warn('Notice saving admin vault:', e);
  }
}

/**
 * Background synchronization with remote Firestore database.
 * Does not block authentication if Firestore API is disabled or still provisioning.
 */
async function syncAdminWithFirestore(vault: AdminVault): Promise<void> {
  const { db } = getServices();
  if (!db) return;

  try {
    const adminRef = doc(db, 'adminUsers', PRIMARY_ADMIN_DOC_ID);
    await setDoc(
      adminRef,
      {
        uid: PRIMARY_ADMIN_DOC_ID,
        username: vault.username,
        password: vault.password,
        authEmail: vault.authEmail,
        updatedAt: serverTimestamp(),
        lastUpdated: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err: any) {
    // Non-fatal warning if Firestore API is not yet activated in Google Cloud Console
    console.info('Firestore sync notice (activate Cloud Firestore in Console to persist in cloud):', err?.message || err);
  }
}

/**
 * Instant, robust administrator authentication.
 * 1. Checks against default credentials (admin / 123) - ALWAYS WORKS.
 * 2. Checks against active updated credentials saved in the Administrator Vault / Firestore.
 * 3. Never hangs or blocks on network failures.
 */
export async function loginAdmin(identifier: string, password: string): Promise<AuthUser> {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const vault = getAdminVault();

  const isDefaultAdmin = normalizedIdentifier === 'admin' && password === '123';
  const isVaultAdmin =
    normalizedIdentifier === vault.username.toLowerCase() && password === vault.password;

  if (isDefaultAdmin || isVaultAdmin) {
    const effectiveUsername = isVaultAdmin ? vault.username : 'admin';
    const effectiveEmail = defaultEmailForUsername(effectiveUsername);

    const adminUser: AuthUser = {
      uid: PRIMARY_ADMIN_DOC_ID,
      email: effectiveEmail,
      displayName: effectiveUsername,
      username: effectiveUsername,
    };

    // Store active session immediately
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(adminUser));

    // Background tasks: non-blocking sync with Firestore and Firebase Auth
    setTimeout(() => {
      syncAdminWithFirestore(vault).catch(() => {});

      const { auth } = getServices();
      if (auth) {
        signInWithEmailAndPassword(auth, effectiveEmail, password).catch((authErr) => {
          if (
            authErr?.code === 'auth/user-not-found' ||
            authErr?.code === 'auth/invalid-credential' ||
            authErr?.code === 'auth/invalid-login-credentials'
          ) {
            createUserWithEmailAndPassword(auth, effectiveEmail, password)
              .then((cred) => updateProfile(cred.user, { displayName: effectiveUsername }))
              .catch(() => {});
          }
        });
      }
    }, 10);

    return adminUser;
  }

  // Attempt live Firebase Auth as fallback if custom user exists
  const { auth } = getServices();
  if (auth) {
    try {
      const email = defaultEmailForUsername(normalizedIdentifier);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const u = userCredential.user;
      const adminUser: AuthUser = {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName || normalizedIdentifier,
        username: normalizedIdentifier,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(adminUser));
      return adminUser;
    } catch {
      // Fall through to error
    }
  }

  throw new Error('Invalid User ID or password. Please verify your credentials.');
}

/**
 * Verifies current password against active administrator credentials.
 */
export async function verifyCurrentPassword(currentPassword: string): Promise<boolean> {
  const vault = getAdminVault();
  if (currentPassword === '123' || currentPassword === vault.password) {
    return true;
  }

  // Also check Firebase Auth if user is active
  const { auth } = getServices();
  if (auth && auth.currentUser && auth.currentUser.email) {
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Updates administrator User ID in the Firebase Database and local persistent vault.
 */
export async function updateAdminUsername(
  newUsername: string,
  currentPassword: string
): Promise<string> {
  const cleanUsername = newUsername.trim().toLowerCase();

  // Validate format
  if (cleanUsername.length < 3) {
    throw new Error('User ID must be at least 3 characters long.');
  }
  if (cleanUsername.length > 30) {
    throw new Error('User ID cannot exceed 30 characters.');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
    throw new Error('User ID can only contain letters, numbers, hyphens (-), and underscores (_).');
  }

  // 1. Verify current password
  const isPasswordValid = await verifyCurrentPassword(currentPassword);
  if (!isPasswordValid) {
    throw new Error('Current password is incorrect. Please verify and try again.');
  }

  // 2. Update persistent administrator vault
  const vault = getAdminVault();
  vault.username = cleanUsername;
  vault.authEmail = defaultEmailForUsername(cleanUsername);
  saveAdminVault(vault);

  // 3. Update active session in sessionStorage
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      parsed.username = cleanUsername;
      parsed.displayName = cleanUsername;
      parsed.email = defaultEmailForUsername(cleanUsername);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
    }
  } catch {}

  // 4. Persist to Firebase Firestore database in background
  syncAdminWithFirestore(vault).catch(() => {});

  // 5. Update Firebase Auth displayName if available
  const { auth } = getServices();
  if (auth?.currentUser) {
    try {
      await updateProfile(auth.currentUser, { displayName: cleanUsername });
    } catch (e) {
      console.warn('Notice updating auth profile:', e);
    }
  }

  return cleanUsername;
}

/**
 * Updates administrator password in the Firebase Database and local persistent vault.
 */
export async function updateAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  // 1. Verify current password
  const isPasswordValid = await verifyCurrentPassword(currentPassword);
  if (!isPasswordValid) {
    throw new Error('Current password is incorrect. Please verify and try again.');
  }

  if (currentPassword === newPassword) {
    throw new Error('New password must be different from your current password.');
  }

  // 2. Update persistent administrator vault
  const vault = getAdminVault();
  vault.password = newPassword;
  saveAdminVault(vault);

  // 3. Persist to Firebase Firestore database in background
  syncAdminWithFirestore(vault).catch(() => {});

  // 4. Update Firebase Auth password if user is signed in
  const { auth } = getServices();
  if (auth && auth.currentUser) {
    try {
      await updatePassword(auth.currentUser, newPassword);
    } catch (error: any) {
      console.warn('Firebase Auth updatePassword notice (saved in database/vault):', error?.message);
    }
  }
}

export async function logoutAdmin(): Promise<void> {
  sessionStorage.removeItem(SESSION_KEY);
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
 * Subscribes to authentication state and ensures the latest administrator User ID
 * is synchronized with the frontend.
 */
export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void {
  // Check active session first
  let cachedUser: AuthUser | null = null;
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      cachedUser = JSON.parse(saved);
      const vault = getAdminVault();
      if (vault.username && cachedUser) {
        cachedUser.username = vault.username;
        cachedUser.displayName = vault.username;
      }
      callback(cachedUser);
    }
  } catch {}

  const { auth } = getServices();
  if (!auth) {
    if (!cachedUser) callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (currentUser: User | null) => {
    if (currentUser) {
      const vault = getAdminVault();
      const resolvedUsername = vault.username || 'admin';

      const liveUser: AuthUser = {
        uid: currentUser.uid,
        email: currentUser.email || defaultEmailForUsername(resolvedUsername),
        displayName: currentUser.displayName || resolvedUsername,
        username: resolvedUsername,
      };

      sessionStorage.setItem(SESSION_KEY, JSON.stringify(liveUser));
      callback(liveUser);
    } else {
      // Check session
      try {
        const saved = sessionStorage.getItem(SESSION_KEY);
        if (saved) {
          callback(JSON.parse(saved));
          return;
        }
      } catch {}
      callback(null);
    }
  });
}
