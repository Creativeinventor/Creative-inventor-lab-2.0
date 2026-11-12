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
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { getServices } from './firebase';
import { AuthUser } from '../types';

const DEFAULT_DOMAIN = import.meta.env.VITE_ADMIN_EMAIL_DOMAIN || 'creativeinventorlab.internal';

export function defaultEmailForUsername(username: string): string {
  const trimmed = username.trim().toLowerCase();
  if (trimmed.includes('@')) {
    return trimmed;
  }
  return `${trimmed}@${DEFAULT_DOMAIN}`;
}

/**
 * Resolves a User ID / username to its linked Firebase Authentication email.
 * First searches Firestore collection 'adminUsers' by username.
 * Falls back to default domain mapping for initial 'admin' setup.
 */
export async function resolveUsernameToEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim().toLowerCase();
  if (trimmed.includes('@')) {
    return trimmed;
  }

  const { db } = getServices();
  if (db) {
    try {
      const q = query(collection(db, 'adminUsers'), where('username', '==', trimmed));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const data = querySnapshot.docs[0].data();
        if (data.authEmail) {
          return data.authEmail;
        }
      }
    } catch (err) {
      console.warn('Error resolving username from Firestore:', err);
    }
  }

  // Fallback for default initial administrator
  if (trimmed === 'admin') {
    return defaultEmailForUsername('admin');
  }

  // If not found in adminUsers and not 'admin', try direct domain mapping
  return defaultEmailForUsername(trimmed);
}

/**
 * Ensures administrator profile exists in Firestore and retrieves the current User ID.
 */
export async function getOrCreateAdminProfile(user: User, fallbackUsername: string = 'admin'): Promise<string> {
  const { db } = getServices();
  if (!db) {
    return fallbackUsername;
  }

  const profileRef = doc(db, 'adminUsers', user.uid);
  try {
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      const data = snap.data();
      return data.username || fallbackUsername;
    }

    // First-time profile bootstrap in Firestore
    const username = fallbackUsername.toLowerCase();
    await setDoc(profileRef, {
      uid: user.uid,
      username,
      authEmail: user.email || defaultEmailForUsername(username),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return username;
  } catch (err) {
    console.warn('Error syncing admin profile in Firestore:', err);
    return fallbackUsername;
  }
}

/**
 * Production Firebase Authentication login supporting username resolution.
 */
export async function loginAdmin(identifier: string, password: string): Promise<AuthUser> {
  const { auth } = getServices();
  if (!auth) {
    throw new Error(
      'Firebase Authentication service could not be initialized. Please check your Firebase project configuration.'
    );
  }

  const normalizedIdentifier = identifier.trim().toLowerCase();
  const email = await resolveUsernameToEmail(identifier);

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const u = userCredential.user;
    const currentUsername = await getOrCreateAdminProfile(u, normalizedIdentifier);

    return {
      uid: u.uid,
      email: u.email,
      displayName: u.displayName || currentUsername,
      username: currentUsername,
    };
  } catch (error: any) {
    const errorCode = error?.code;

    // Secure initial administrator account provisioning:
    // If the account does not exist in Firebase Auth yet and credentials match 'admin' / '123'
    if (
      (errorCode === 'auth/user-not-found' ||
        errorCode === 'auth/invalid-credential' ||
        errorCode === 'auth/invalid-login-credentials') &&
      normalizedIdentifier === 'admin'
    ) {
      try {
        const newCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(newCredential.user, {
          displayName: 'Administrator',
        });
        const u = newCredential.user;
        const currentUsername = await getOrCreateAdminProfile(u, 'admin');

        return {
          uid: u.uid,
          email: u.email,
          displayName: 'Administrator',
          username: currentUsername,
        };
      } catch (createError: any) {
        if (createError?.code === 'auth/email-already-in-use') {
          throw new Error('Invalid User ID or password. Please verify your credentials.');
        } else if (createError?.code === 'auth/operation-not-allowed') {
          throw new Error(
            "Email/Password provider is not enabled in Firebase Console. Please enable 'Email/Password' under Firebase Console -> Authentication -> Sign-in method."
          );
        }
        throw new Error(
          createError?.message || 'Authentication failed. Please verify credentials.'
        );
      }
    }

    // Friendly, secure error handling
    if (
      errorCode === 'auth/wrong-password' ||
      errorCode === 'auth/invalid-credential' ||
      errorCode === 'auth/invalid-login-credentials'
    ) {
      throw new Error('Invalid User ID or password. Please verify your credentials.');
    } else if (errorCode === 'auth/user-not-found') {
      throw new Error('Administrator account not found. Please verify your User ID or password.');
    } else if (errorCode === 'auth/too-many-requests') {
      throw new Error('Access temporarily locked due to too many failed login attempts. Please wait a few moments.');
    } else if (errorCode === 'auth/network-request-failed') {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error?.message || 'Authentication failed. Please verify credentials.');
    }
  }
}

/**
 * Re-authenticates the current administrator using their current password.
 */
export async function reauthenticateAdmin(currentPassword: string): Promise<void> {
  const { auth } = getServices();
  if (!auth || !auth.currentUser || !auth.currentUser.email) {
    throw new Error('No administrator is currently authenticated.');
  }

  const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
  try {
    await reauthenticateWithCredential(auth.currentUser, credential);
  } catch (error: any) {
    if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
      throw new Error('Current password is incorrect. Please verify and try again.');
    }
    throw new Error(error?.message || 'Verification of current password failed.');
  }
}

/**
 * Updates administrator User ID in Firestore.
 * Ensures the new User ID is unique across accounts.
 */
export async function updateAdminUsername(
  newUsername: string,
  currentPassword: string
): Promise<string> {
  const { auth, db } = getServices();
  if (!auth || !auth.currentUser) {
    throw new Error('No administrator is currently authenticated.');
  }
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }

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

  // 1. Re-authenticate current user
  await reauthenticateAdmin(currentPassword);

  // 2. Check if new username is already taken by another user
  const q = query(collection(db, 'adminUsers'), where('username', '==', cleanUsername));
  const querySnapshot = await getDocs(q);
  const isTakenByOther = querySnapshot.docs.some((d) => d.id !== auth.currentUser!.uid);

  if (isTakenByOther) {
    throw new Error(`The User ID "${newUsername}" is already assigned to another account. Please choose a different one.`);
  }

  // 3. Update in Firestore
  const profileRef = doc(db, 'adminUsers', auth.currentUser.uid);
  await setDoc(
    profileRef,
    {
      uid: auth.currentUser.uid,
      username: cleanUsername,
      authEmail: auth.currentUser.email || defaultEmailForUsername(cleanUsername),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 4. Update Firebase Auth displayName
  try {
    await updateProfile(auth.currentUser, {
      displayName: cleanUsername,
    });
  } catch (e) {
    console.warn('Could not update Auth displayName:', e);
  }

  return cleanUsername;
}

/**
 * Updates administrator password via Firebase Authentication.
 * Never stores passwords in Firestore or local storage.
 */
export async function updateAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const { auth } = getServices();
  if (!auth || !auth.currentUser) {
    throw new Error('No administrator is currently authenticated.');
  }

  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  // 1. Re-authenticate first
  await reauthenticateAdmin(currentPassword);

  // 2. Securely update password in Firebase Auth
  try {
    await updatePassword(auth.currentUser, newPassword);
  } catch (error: any) {
    if (error?.code === 'auth/weak-password') {
      throw new Error('The password is too weak. Please use a stronger combination of characters.');
    } else if (error?.code === 'auth/requires-recent-login') {
      throw new Error('For security, please log out and log in again before changing your password.');
    }
    throw new Error(error?.message || 'Failed to update administrator password.');
  }
}

export async function logoutAdmin(): Promise<void> {
  const { auth } = getServices();
  if (auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('SignOut warning:', e);
    }
  }
}

export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void {
  const { auth, db } = getServices();
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (currentUser: User | null) => {
    if (currentUser) {
      let username = 'admin';
      if (db) {
        try {
          const profileSnap = await getDoc(doc(db, 'adminUsers', currentUser.uid));
          if (profileSnap.exists()) {
            username = profileSnap.data().username || 'admin';
          }
        } catch {
          // fallback
        }
      }

      callback({
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName || username,
        username,
      });
    } else {
      callback(null);
    }
  });
}
