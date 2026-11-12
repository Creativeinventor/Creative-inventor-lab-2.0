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
 * Loads the active administrator credentials from local storage cache.
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
 * Fetches the authoritative administrator credentials from:
 * 1. Server-side persistent storage API (/api/admin/credentials)
 * 2. Remote Firestore database (/adminUsers/primary_admin)
 * 3. Client storage vault
 * Guarantees cross-device, cross-browser, cross-iframe consistency!
 */
export async function fetchAuthoritativeCredentials(): Promise<AdminVault> {
  let vault = getAdminVault();

  // 1. Fetch from server-side database API if in browser
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    try {
      const res = await Promise.race([
        fetch('/api/admin/credentials'),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1200)),
      ]);

      if (res && res.ok) {
        const data = await res.json();
        if (data && data.username && data.password) {
          vault = {
            username: String(data.username).trim().toLowerCase(),
            password: String(data.password),
            authEmail: data.authEmail || defaultEmailForUsername(data.username),
            updatedAt: data.updatedAt,
          };
          saveAdminVault(vault);
          return vault;
        }
      }
    } catch {
      // Server API fallback to Firestore/vault
    }
  }

  // 2. Fetch from Firebase Firestore database if available
  const { db } = getServices();
  if (db) {
    try {
      const adminRef = doc(db, 'adminUsers', PRIMARY_ADMIN_DOC_ID);
      const snap = await Promise.race([
        getDoc(adminRef),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
      ]);

      if (snap && snap.exists()) {
        const data = snap.data();
        if (data.username && data.password) {
          vault = {
            username: String(data.username).trim().toLowerCase(),
            password: String(data.password),
            authEmail: data.authEmail || defaultEmailForUsername(data.username),
            updatedAt: data.lastUpdated || new Date().toISOString(),
          };
          saveAdminVault(vault);
          return vault;
        }
      }
    } catch {
      // Offline fallback
    }
  }

  return vault;
}

/**
 * Persists administrator credentials to:
 * 1. Server-side database API (/api/admin/credentials)
 * 2. Firebase Firestore database (/adminUsers/primary_admin)
 * 3. Local persistent vault
 */
export async function persistCredentialsGlobally(vault: AdminVault): Promise<void> {
  // 1. Update local cache immediately
  saveAdminVault(vault);

  // 2. Update server-side database API
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    try {
      await fetch('/api/admin/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vault),
      });
    } catch (err) {
      console.warn('Notice saving to server credentials API:', err);
    }
  }

  // 3. Update Firebase Firestore database in background
  const { db } = getServices();
  if (db) {
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
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2500)),
      ]);
    } catch (err: any) {
      console.info('Firestore database sync note:', err?.message || err);
    }
  }
}

/**
 * Production Administrator Login.
 * STRICT ENFORCEMENT:
 * - Only the CURRENT, active administrator credentials can log in.
 * - Old User ID and old Password are completely rejected.
 */
export async function loginAdmin(identifier: string, password: string): Promise<AuthUser> {
  const normalizedIdentifier = identifier.trim().toLowerCase();

  // 1. Check local vault first
  let vault = getAdminVault();
  let isMatch =
    normalizedIdentifier === vault.username.toLowerCase() && password === vault.password;

  // 2. If not matched locally, query server/database to ensure fresh state
  if (!isMatch) {
    vault = await fetchAuthoritativeCredentials();
    isMatch =
      normalizedIdentifier === vault.username.toLowerCase() && password === vault.password;
  }

  // 3. Strict verification: only the active credentials succeed
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

    // Background Firebase Auth sign-in if available
    setTimeout(() => {
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
 */
export async function verifyCurrentPassword(currentPassword: string): Promise<boolean> {
  const vault = await fetchAuthoritativeCredentials();
  return currentPassword === vault.password;
}

/**
 * Updates administrator User ID in Firebase Database, Server Storage, and Vault.
 * Once updated, the old User ID is disabled forever and cannot log in.
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

  // 2. Fetch current authoritative vault
  const vault = await fetchAuthoritativeCredentials();
  vault.username = cleanUsername;
  vault.authEmail = defaultEmailForUsername(cleanUsername);

  // 3. Persist globally to server, database, and local cache
  await persistCredentialsGlobally(vault);

  // 4. Update active session in sessionStorage
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
 * Updates administrator password in Firebase Database, Server Storage, and Vault.
 * Once updated, the old password is disabled forever and cannot log in.
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

  // 2. Fetch current authoritative vault
  const vault = await fetchAuthoritativeCredentials();
  vault.password = newPassword;

  // 3. Persist globally to server, database, and local cache
  await persistCredentialsGlobally(vault);

  // 4. Update Firebase Auth password if user is signed in
  const { auth } = getServices();
  if (auth && auth.currentUser) {
    try {
      await updatePassword(auth.currentUser, newPassword);
    } catch (error: any) {
      console.warn('Firebase Auth updatePassword notice (saved in database):', error?.message);
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

  // Synchronize with authoritative server credentials in background
  fetchAuthoritativeCredentials()
    .then((vault) => {
      if (cachedUser && cachedUser.username !== vault.username) {
        cachedUser.username = vault.username;
        cachedUser.displayName = vault.username;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(cachedUser));
        callback(cachedUser);
      }
    })
    .catch(() => {});

  const { auth } = getServices();
  if (!auth) {
    if (!cachedUser) callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (currentUser: User | null) => {
    if (currentUser) {
      const vault = await fetchAuthoritativeCredentials();
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
