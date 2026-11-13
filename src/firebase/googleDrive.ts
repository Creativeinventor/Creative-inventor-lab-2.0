import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  Auth,
} from 'firebase/auth';
import appletConfig from '../../firebase-applet-config.json';
import { firebaseConfig } from './firebaseConfig';
import {
  DriveAccountInfo,
  DriveBrowseItem,
  UploadedFileRecord,
} from '../types';

export const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'] as const;

const DRIVE_CONNECTOR_APP_NAME = 'google-drive-connector';
const DRIVE_PRIMARY_APP_NAME = 'google-drive-connector-primary';
const LINKED_ITEMS_STORAGE_KEY = 'creative_inventor_drive_links_v1';
const KNOWN_ACCOUNTS_STORAGE_KEY = 'creative_inventor_drive_accounts_v1';

interface InMemoryDriveSession {
  email: string;
  displayName: string;
  photoURL?: string;
  accessToken: string;
  connectedAt: number;
}

// Strict in-memory token store (NEVER stored in localStorage/sessionStorage)
const activeSessions = new Map<string, InMemoryDriveSession>();
const thumbnailBlobCache = new Map<string, string>();
const listeners = new Set<() => void>();

let driveAppInstance: FirebaseApp | null = null;
let driveAuthInstance: Auth | null = null;
let drivePrimaryAppInstance: FirebaseApp | null = null;
let drivePrimaryAuthInstance: Auth | null = null;

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore subscriber callback error
    }
  });
}

export function subscribeToDriveState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function createIsolatedAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

function getDriveAuth(usePrimaryProject: boolean = false): Auth {
  if (usePrimaryProject) {
    if (drivePrimaryAuthInstance) return drivePrimaryAuthInstance;
    const existing = getApps().find((a) => a.name === DRIVE_PRIMARY_APP_NAME);
    if (existing) {
      drivePrimaryAppInstance = existing;
    } else {
      drivePrimaryAppInstance = initializeApp(firebaseConfig, DRIVE_PRIMARY_APP_NAME);
    }
    drivePrimaryAuthInstance = createIsolatedAuth(drivePrimaryAppInstance);
    return drivePrimaryAuthInstance;
  }

  if (driveAuthInstance) return driveAuthInstance;

  const existing = getApps().find((a) => a.name === DRIVE_CONNECTOR_APP_NAME);
  if (existing) {
    driveAppInstance = existing;
  } else {
    driveAppInstance = initializeApp(
      {
        apiKey: appletConfig.apiKey,
        authDomain: appletConfig.authDomain,
        projectId: appletConfig.projectId,
        storageBucket: appletConfig.storageBucket,
        messagingSenderId: appletConfig.messagingSenderId,
        appId: appletConfig.appId,
      },
      DRIVE_CONNECTOR_APP_NAME
    );
  }

  driveAuthInstance = createIsolatedAuth(driveAppInstance);
  return driveAuthInstance;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function loadKnownAccountsFromStorage(): Omit<DriveAccountInfo, 'connected'>[] {
  try {
    const raw = localStorage.getItem(KNOWN_ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveKnownAccountToStorage(account: Omit<DriveAccountInfo, 'connected'>) {
  try {
    const existing = loadKnownAccountsFromStorage();
    const filtered = existing.filter(
      (a) => normalizeEmail(a.email) !== normalizeEmail(account.email)
    );
    const updated = [account, ...filtered];
    localStorage.setItem(KNOWN_ACCOUNTS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota issues
  }
}

export function getKnownAndConnectedDriveAccounts(): DriveAccountInfo[] {
  const resultMap = new Map<string, DriveAccountInfo>();

  for (const acc of loadKnownAccountsFromStorage()) {
    const key = normalizeEmail(acc.email);
    resultMap.set(key, {
      ...acc,
      connected: activeSessions.has(key),
      connectedAt: activeSessions.get(key)?.connectedAt ?? acc.connectedAt,
    });
  }

  for (const [key, session] of activeSessions.entries()) {
    resultMap.set(key, {
      email: session.email,
      displayName: session.displayName,
      photoURL: session.photoURL,
      connected: true,
      connectedAt: session.connectedAt,
    });
  }

  return Array.from(resultMap.values()).sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return (b.connectedAt || 0) - (a.connectedAt || 0);
  });
}

export function getActiveDriveToken(email?: string): string | null {
  if (!email) return null;
  const session = activeSessions.get(normalizeEmail(email));
  return session?.accessToken || null;
}

export function clearAllDriveTokens() {
  activeSessions.clear();
  for (const url of thumbnailBlobCache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore revoke errors
    }
  }
  thumbnailBlobCache.clear();
  notifyListeners();
}

export function disconnectDriveAccountSession(email: string) {
  activeSessions.delete(normalizeEmail(email));
  notifyListeners();
}

export function removeKnownDriveAccount(email: string) {
  const key = normalizeEmail(email);
  activeSessions.delete(key);
  try {
    const remaining = loadKnownAccountsFromStorage().filter(
      (a) => normalizeEmail(a.email) !== key
    );
    localStorage.setItem(KNOWN_ACCOUNTS_STORAGE_KEY, JSON.stringify(remaining));
  } catch {
    // Ignore storage error
  }
  notifyListeners();
}

/**
 * Opens Google's device account chooser and requests Drive read-only permission.
 * Runs in an isolated secondary Firebase Auth app with inMemoryPersistence so it
 * never logs out or overwrites the primary 20sgamingrohit@gmail.com admin session.
 */
export async function connectGoogleDriveAccount(
  loginHintOrOptions?: string | { loginHintEmail?: string; usePrimaryProject?: boolean }
): Promise<DriveAccountInfo> {
  const loginHintEmail =
    typeof loginHintOrOptions === 'string'
      ? loginHintOrOptions
      : loginHintOrOptions?.loginHintEmail;

  const isAiStudioOrLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.run.app') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  const usePrimaryProject =
    typeof loginHintOrOptions === 'object' &&
    loginHintOrOptions?.usePrimaryProject !== undefined
      ? loginHintOrOptions.usePrimaryProject
      : !isAiStudioOrLocalHost;

  const driveAuth = getDriveAuth(usePrimaryProject);
  const provider = new GoogleAuthProvider();
  provider.addScope(SCOPES[0]);

  const customParams: Record<string, string> = {
    prompt: 'select_account',
  };
  if (loginHintEmail) {
    customParams.login_hint = loginHintEmail;
  }
  provider.setCustomParameters(customParams);

  try {
    const result = await signInWithPopup(driveAuth, provider, browserPopupRedirectResolver);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error(
        'Could not obtain Google Drive access permission. Please try again and allow Drive access.'
      );
    }

    // Fetch canonical Drive user profile using Drive v3 /about
    let email = result.user.email || loginHintEmail || '';
    let displayName = result.user.displayName || 'Google Drive User';
    let photoURL = result.user.photoURL || undefined;

    try {
      const aboutRes = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (aboutRes.ok) {
        const aboutData = await aboutRes.json();
        if (aboutData?.user?.emailAddress) email = aboutData.user.emailAddress;
        if (aboutData?.user?.displayName) displayName = aboutData.user.displayName;
        if (aboutData?.user?.photoLink) photoURL = aboutData.user.photoLink;
      }
    } catch {
      // Non-fatal; use Firebase popup profile fields
    }

    if (!email) {
      throw new Error('Could not determine the selected Google Drive email address.');
    }

    const key = normalizeEmail(email);
    const connectedAt = Date.now();

    activeSessions.set(key, {
      email,
      displayName,
      photoURL,
      accessToken,
      connectedAt,
    });

    saveKnownAccountToStorage({
      email,
      displayName,
      photoURL,
      connectedAt,
    });

    notifyListeners();

    return {
      email,
      displayName,
      photoURL,
      connected: true,
      connectedAt,
    };
  } catch (error: any) {
    const code = error?.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google account selection was cancelled.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Browser blocked the Google account chooser popup. Please allow popups for this site and try again.'
      );
    }
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      const targetProject = usePrimaryProject ? firebaseConfig.projectId : appletConfig.projectId;
      throw new Error(
        `UNAUTHORIZED_DRIVE_DOMAIN:${host}:${targetProject}`
      );
    }
    throw new Error(error?.message || 'Failed to connect Google Drive account.');
  }
}

function formatDriveThumbUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace(/=s\d+(-c)?$/, '=s480');
}

function escapeDriveQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Lists files & folders in a connected Google Drive account.
 */
export async function listDriveItems(
  accountEmail: string,
  options: {
    folderId?: string;
    searchQuery?: string;
    pageToken?: string;
  } = {}
): Promise<{ items: DriveBrowseItem[]; nextPageToken?: string }> {
  const token = getActiveDriveToken(accountEmail);
  if (!token) {
    throw new Error('DRIVE_SESSION_EXPIRED');
  }

  const folderId = options.folderId || 'root';
  const trimmedSearch = options.searchQuery?.trim();

  let q = 'trashed = false';
  if (trimmedSearch) {
    q = `trashed = false and name contains '${escapeDriveQueryValue(trimmedSearch)}'`;
  } else if (folderId === 'sharedWithMe') {
    q = 'sharedWithMe = true and trashed = false';
  } else {
    q = `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`;
  }

  const params = new URLSearchParams({
    q,
    orderBy: 'folder,modifiedTime desc',
    pageSize: '100',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    fields:
      'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink,webViewLink,webContentLink,parents,trashed)',
  });

  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    disconnectDriveAccountSession(accountEmail);
    throw new Error('DRIVE_SESSION_EXPIRED');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let apiMsg: string | null = null;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) {
        apiMsg = parsed.error.message;
      }
    } catch {
      // Ignore JSON parse failure
    }
    throw new Error(
      apiMsg || `Google Drive API error (${res.status}): ${errText || res.statusText}`
    );
  }

  const data = await res.json();
  const files: any[] = Array.isArray(data?.files) ? data.files : [];

  const items: DriveBrowseItem[] = files.map((f) => ({
    id: f.id,
    name: f.name || 'Untitled',
    mimeType: f.mimeType || 'application/octet-stream',
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    size: Number(f.size || 0),
    modifiedTime: f.modifiedTime || new Date().toISOString(),
    thumbnailLink: formatDriveThumbUrl(f.thumbnailLink),
    iconLink: f.iconLink,
    webViewLink:
      f.webViewLink ||
      (f.mimeType === 'application/vnd.google-apps.folder'
        ? `https://drive.google.com/drive/folders/${f.id}`
        : `https://drive.google.com/file/d/${f.id}/view`),
    webContentLink: f.webContentLink,
    parents: f.parents,
    trashed: Boolean(f.trashed),
  }));

  return {
    items,
    nextPageToken: data?.nextPageToken,
  };
}

/**
 * Persisted linked files & folders (stored as non-secret metadata links).
 */
export function getLinkedDriveItems(): UploadedFileRecord[] {
  try {
    const raw = localStorage.getItem(LINKED_ITEMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLinkedDriveItemsList(items: UploadedFileRecord[]) {
  try {
    localStorage.setItem(LINKED_ITEMS_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Could not persist Drive links to localStorage:', err);
  }
  notifyListeners();
}

export function makeDriveRecordId(accountEmail: string, driveFileId: string): string {
  return `gdrive_${normalizeEmail(accountEmail)}_${driveFileId}`;
}

export function addLinkedDriveItems(
  account: Pick<DriveAccountInfo, 'email' | 'displayName' | 'photoURL'>,
  items: DriveBrowseItem[]
): UploadedFileRecord[] {
  const existing = getLinkedDriveItems();
  const byId = new Map<string, UploadedFileRecord>();

  for (const rec of existing) {
    byId.set(rec.id, rec);
  }

  const nowIso = new Date().toISOString();
  const added: UploadedFileRecord[] = [];

  for (const item of items) {
    const id = makeDriveRecordId(account.email, item.id);
    const webViewLink =
      item.webViewLink ||
      (item.isFolder
        ? `https://drive.google.com/drive/folders/${item.id}`
        : `https://drive.google.com/file/d/${item.id}/view`);

    const record: UploadedFileRecord = {
      id,
      fileName: item.name,
      fileType: item.mimeType,
      fileSize: item.size || 0,
      storagePath: `Google Drive (${account.email})/${item.isFolder ? 'Folder' : 'File'}`,
      downloadURL: item.webContentLink || webViewLink,
      uploadedAt: item.modifiedTime || nowIso,
      uploadedBy: account.email,
      source: 'google-drive',
      isFolder: item.isFolder,
      driveFileId: item.id,
      driveAccountEmail: account.email,
      driveAccountName: account.displayName,
      driveAccountPhoto: account.photoURL,
      thumbnailLink: item.thumbnailLink,
      iconLink: item.iconLink,
      webViewLink,
      webContentLink: item.webContentLink,
    };

    byId.set(id, record);
    added.push(record);
  }

  saveLinkedDriveItemsList(Array.from(byId.values()));
  return added;
}

export function removeLinkedDriveItem(recordId: string) {
  const existing = getLinkedDriveItems();
  const filtered = existing.filter((item) => item.id !== recordId);
  saveLinkedDriveItemsList(filtered);
}

/**
 * Checks linked items belonging to a connected Google Drive account.
 * Removes any links whose files/folders were trashed or deleted in Google Drive,
 * and updates fresh thumbnail links & metadata for active items.
 */
export async function syncLinkedItemsWithDrive(accountEmail: string): Promise<{
  removedCount: number;
  updatedCount: number;
  removedNames: string[];
}> {
  const token = getActiveDriveToken(accountEmail);
  if (!token) {
    return { removedCount: 0, updatedCount: 0, removedNames: [] };
  }

  const allItems = getLinkedDriveItems();
  const targetEmail = normalizeEmail(accountEmail);
  const itemsToVerify = allItems.filter(
    (item) =>
      item.source === 'google-drive' &&
      item.driveFileId &&
      item.driveAccountEmail &&
      normalizeEmail(item.driveAccountEmail) === targetEmail
  );

  if (itemsToVerify.length === 0) {
    return { removedCount: 0, updatedCount: 0, removedNames: [] };
  }

  const removedIds = new Set<string>();
  const removedNames: string[] = [];
  const updates = new Map<string, Partial<UploadedFileRecord>>();

  await Promise.all(
    itemsToVerify.map(async (item) => {
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            item.driveFileId!
          )}?supportsAllDrives=true&fields=id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink,webViewLink,webContentLink,trashed`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.status === 401) {
          disconnectDriveAccountSession(accountEmail);
          return;
        }

        if (res.status === 404) {
          removedIds.add(item.id);
          removedNames.push(item.fileName);
          return;
        }

        if (!res.ok) return;

        const data = await res.json();
        if (data?.trashed) {
          removedIds.add(item.id);
          removedNames.push(item.fileName);
          return;
        }

        updates.set(item.id, {
          fileName: data.name || item.fileName,
          fileType: data.mimeType || item.fileType,
          fileSize: Number(data.size ?? item.fileSize ?? 0),
          uploadedAt: data.modifiedTime || item.uploadedAt,
          thumbnailLink: formatDriveThumbUrl(data.thumbnailLink) || item.thumbnailLink,
          iconLink: data.iconLink || item.iconLink,
          webViewLink: data.webViewLink || item.webViewLink,
          webContentLink: data.webContentLink || item.webContentLink,
          downloadURL: data.webContentLink || data.webViewLink || item.downloadURL,
        });
      } catch {
        // Ignore transient network errors during background verification
      }
    })
  );

  if (removedIds.size > 0 || updates.size > 0) {
    const nextList = allItems
      .filter((item) => !removedIds.has(item.id))
      .map((item) => (updates.has(item.id) ? { ...item, ...updates.get(item.id) } : item));
    saveLinkedDriveItemsList(nextList);
  }

  return {
    removedCount: removedIds.size,
    updatedCount: updates.size,
    removedNames,
  };
}

/**
 * Resolves a thumbnail image Blob URL using the active in-memory Drive token when available.
 */
export async function resolveDriveThumbnailObjectUrl(
  driveFileId: string,
  accountEmail: string,
  mimeType: string = '',
  thumbnailLink?: string
): Promise<string | null> {
  const cacheKey = `${normalizeEmail(accountEmail)}_${driveFileId}`;
  if (thumbnailBlobCache.has(cacheKey)) {
    return thumbnailBlobCache.get(cacheKey)!;
  }

  const token = getActiveDriveToken(accountEmail);
  if (!token) return null;

  try {
    // Prefer Drive thumbnailLink with auth if available; for direct image files, fall back to media
    if (thumbnailLink) {
      const thumbRes = await fetch(thumbnailLink, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (thumbRes.ok) {
        const blob = await thumbRes.blob();
        if (blob.type.startsWith('image/')) {
          const objUrl = URL.createObjectURL(blob);
          thumbnailBlobCache.set(cacheKey, objUrl);
          return objUrl;
        }
      }
    }

    if (mimeType.startsWith('image/')) {
      const mediaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (mediaRes.ok) {
        const blob = await mediaRes.blob();
        const objUrl = URL.createObjectURL(blob);
        thumbnailBlobCache.set(cacheKey, objUrl);
        return objUrl;
      }
    }
  } catch {
    // Non-fatal fallback
  }

  return null;
}

/**
 * Fetches file content as Blob from Google Drive (supports both binary files & Workspace exports).
 */
export async function fetchDriveFileBlob(
  driveFileId: string,
  accountEmail: string,
  mimeType: string = ''
): Promise<{ blob: Blob; exportedMime: string } | null> {
  const token = getActiveDriveToken(accountEmail);
  if (!token) return null;

  let url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    driveFileId
  )}?alt=media&supportsAllDrives=true`;
  let exportedMime = mimeType;

  if (mimeType === 'application/vnd.google-apps.document') {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      driveFileId
    )}/export?mimeType=application/pdf`;
    exportedMime = 'application/pdf';
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      driveFileId
    )}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
    exportedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      driveFileId
    )}/export?mimeType=application/pdf`;
    exportedMime = 'application/pdf';
  } else if (mimeType === 'application/vnd.google-apps.drawing') {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      driveFileId
    )}/export?mimeType=image/png`;
    exportedMime = 'image/png';
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    disconnectDriveAccountSession(accountEmail);
    return null;
  }

  if (!res.ok) return null;
  const blob = await res.blob();
  return { blob, exportedMime };
}

export async function fetchDriveTextContent(
  driveFileId: string,
  accountEmail: string,
  mimeType: string = ''
): Promise<string | null> {
  const token = getActiveDriveToken(accountEmail);
  if (!token) return null;

  let url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    driveFileId
  )}?alt=media&supportsAllDrives=true`;

  if (mimeType.startsWith('application/vnd.google-apps.')) {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      driveFileId
    )}/export?mimeType=text/plain`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.text();
}

export async function triggerDriveFileDownload(record: UploadedFileRecord): Promise<void> {
  if (record.driveFileId && record.driveAccountEmail && !record.isFolder) {
    const token = getActiveDriveToken(record.driveAccountEmail);
    if (token) {
      try {
        const result = await fetchDriveFileBlob(
          record.driveFileId,
          record.driveAccountEmail,
          record.fileType
        );
        if (result) {
          const objUrl = URL.createObjectURL(result.blob);
          const a = document.createElement('a');
          a.href = objUrl;
          a.download = record.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
          return;
        }
      } catch {
        // Fallback below
      }
    }
  }

  const fallbackUrl = record.webContentLink || record.webViewLink || record.downloadURL;
  if (fallbackUrl) {
    const a = document.createElement('a');
    a.href = fallbackUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
