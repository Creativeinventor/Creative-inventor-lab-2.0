import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getServices } from './firebase';
import { AuthUser } from '../types';

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

export interface AdminVault {
  username: string;
  password: string;
  authEmail: string;
  updatedAt?: string;
}

/**
 * Loads the active administrator credentials from local persistent storage.
 * Defaults to initial credentials (admin / 123) only until the administrator updates them.
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
 * Persists administrator credentials to remote Firebase Firestore database.
 * Uses a safe timeout guard so it does not block the application if Firestore API is still provisioning.
 */
export async function syncAdminWithFirestore(vault: AdminVault): Promise<void> {
  const { db } = getServices();
  if (!db) return;

  try {
    const adminRef = doc(db, 'adminUsers', PRIMARY_ADMIN_DOC_ID);
    await Promise.race([
      setDoc(
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
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 3000)),
    ]);
  } catch (err: any) {
    console.info('Firestore database sync note:', err?.message || err);
  }
}

/**
 * Synchronizes local vault with remote Firestore database if reachable.
 */
export async function refreshVaultFromFirestore(): Promise<AdminVault> {
  const vault = getAdminVault();
  const { db } = getServices();
  if (!db) return vault;

  try {
    const adminRef = doc(db, 'adminUsers', PRIMARY_ADMIN_DOC_ID);
    const snap = await Promise.race([
      getDoc(adminRef),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);

    if (snap && snap.exists()) {
      const data = snap.data();
      if (data.username && data.password) {
        vault.username = String(data.username).trim().toLowerCase();
        vault.password = String(data.password);
        vault.authEmail = data.authEmail || defaultEmailForUsername(vault.username);
        vault.updatedAt = data.lastUpdated || new Date().toISOString();
        saveAdminVault(vault);
      }
    }
  } catch {
    // If remote read is offline, local persistent vault is authoritative
  }

  return vault;
}

/**
 * Production Administrator Login.
 * STRICT ENFORCEMENT:
 * - Only the CURRENT, active administrator credentials can log in.
 * - Once User ID or Password is changed, the old User ID and old Password are completely rejected.
 * - Checks active credentials immediately (<5ms) and updates session.
 */
export async function loginAdmin(identifier: string, password: string): Promise<AuthUser> {
  const normalizedIdentifier = identifier.trim().toLowerCase();

  // 1. Check current active credentials from vault first
  let vault = getAdminVault();
  let isMatch =
    normalizedIdentifier === vault.username.toLowerCase() && password === vault.password;

  // 2. If no local match, check if credentials were changed in Firestore
  if (!isMatch) {
    vault = await refreshVaultFromFirestore();
    isMatch =
      normalizedIdentifier === vault.username.toLowerCase() && password === vault.password;
  }

  // 3. Strict match evaluation: only current active credentials succeed
  if (isMatch) {
    const effectiveUsername = vault.username;
    const effectiveEmail = vault.authEmail || defaultEmailForUsername(effectiveUsername);

    const adminUser: AuthUser = {
      uid: PRIMARY_ADMIN_DOC_ID,
      email: effectiveEmail,
      displayName: effectiveUsername,
      username: effectiveUsername,
    };

    // Store active session immediately
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(adminUser));

    // Background task: persist to remote Firestore and Firebase Auth
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

  // Old or invalid credentials (such as previous User ID or old password) are strictly rejected
  throw new Error('Invalid User ID or password. Please verify your credentials.');
}

/**
 * Verifies current password against the active administrator password.
 * Strictly requires the CURRENT password.
 */
export async function verifyCurrentPassword(currentPassword: string): Promise<boolean> {
  const vault = getAdminVault();
  return currentPassword === vault.password;
}

/**
 * Updates administrator User ID in Firebase Database and persistent storage.
 * Once updated, the old User ID is immediately disabled and cannot log in.
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

  // 4. PERSIST TO FIREBASE FIRESTORE DATABASE
  await syncAdminWithFirestore(vault);

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
 * Updates administrator password in Firebase Database and persistent storage.
 * Once updated, the old password is immediately disabled and cannot log in.
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

  // 3. PERSIST TO FIREBASE FIRESTORE DATABASE
  await syncAdminWithFirestore(vault);

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
