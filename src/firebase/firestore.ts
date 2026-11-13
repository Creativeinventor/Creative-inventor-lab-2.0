import {
  collection,
  addDoc,
  deleteDoc,
  setDoc,
  getDocs,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore';
import { getServices } from './firebase';
import { UploadedFileRecord } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  shouldThrow: boolean = true
) {
  const { auth } = getServices();
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
    },
  };
  if (shouldThrow) {
    console.warn('Firestore Notice: ', JSON.stringify(errInfo));
    throw new Error(error instanceof Error ? error.message : String(error));
  } else {
    console.warn('Firestore Subscription Notice: ', JSON.stringify(errInfo));
  }
}

export async function saveUploadedFileMetadata(fileData: {
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  downloadURL: string;
  uploadedBy: string;
}): Promise<string> {
  const { db } = getServices();
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }

  const collectionPath = 'uploadedFiles';
  try {
    const docRef = await Promise.race([
      addDoc(collection(db, collectionPath), {
        fileName: fileData.fileName,
        fileType: fileData.fileType || 'application/octet-stream',
        fileSize: fileData.fileSize,
        storagePath: fileData.storagePath,
        downloadURL: fileData.downloadURL,
        uploadedBy: fileData.uploadedBy,
        uploadedAt: serverTimestamp(),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                'File uploaded to Storage, but saving metadata timed out. Ensure Cloud Firestore Database is created and enabled in Firebase Console (Build -> Firestore Database).'
              )
            ),
          12000
        )
      ),
    ]);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, collectionPath, true);
    return '';
  }
}

export function subscribeToUploadedFiles(
  onUpdate: (files: UploadedFileRecord[]) => void,
  onError: (error: any) => void
): () => void {
  const { db } = getServices();
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  const collectionPath = 'uploadedFiles';
  let activeUnsub: (() => void) | null = null;
  let isDisposed = false;

  try {
    const q = query(collection(db, collectionPath), orderBy('uploadedAt', 'desc'));

    activeUnsub = onSnapshot(
      q,
      (snapshot) => {
        if (isDisposed) return;
        const files: UploadedFileRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            fileName: data.fileName || 'Untitled',
            fileType: data.fileType || '',
            fileSize: data.fileSize || 0,
            storagePath: data.storagePath || '',
            downloadURL: data.downloadURL || '',
            uploadedAt: data.uploadedAt,
            uploadedBy: data.uploadedBy || 'admin',
          };
        });
        onUpdate(files);
      },
      (error) => {
        if (isDisposed) return;
        console.warn('Ordered query on uploadedFiles skipped:', error?.code || error?.message);

        // If permission-denied or not-found, do not crash or throw unhandled errors
        if (error?.code === 'permission-denied' || error?.code === 'not-found') {
          onUpdate([]);
          onError(error);
          return;
        }

        try {
          activeUnsub = onSnapshot(
            collection(db, collectionPath),
            (snapshot) => {
              if (isDisposed) return;
              const files: UploadedFileRecord[] = snapshot.docs.map((d) => {
                const data = d.data();
                return {
                  id: d.id,
                  fileName: data.fileName || 'Untitled',
                  fileType: data.fileType || '',
                  fileSize: data.fileSize || 0,
                  storagePath: data.storagePath || '',
                  downloadURL: data.downloadURL || '',
                  uploadedAt: data.uploadedAt,
                  uploadedBy: data.uploadedBy || 'admin',
                };
              });
              files.sort((a, b) => {
                const timeA = a.uploadedAt?.seconds || 0;
                const timeB = b.uploadedAt?.seconds || 0;
                return timeB - timeA;
              });
              onUpdate(files);
            },
            (fallbackErr) => {
              if (isDisposed) return;
              handleFirestoreError(fallbackErr, OperationType.LIST, collectionPath, false);
              onUpdate([]);
              onError(fallbackErr);
            }
          );
        } catch (e) {
          onUpdate([]);
          onError(e);
        }
      }
    );

    return () => {
      isDisposed = true;
      if (activeUnsub) {
        activeUnsub();
      }
    };
  } catch (error) {
    onUpdate([]);
    onError(error);
    return () => {};
  }
}

export async function deleteUploadedFileMetadata(fileId: string): Promise<void> {
  const { db } = getServices();
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }

  const docPath = `uploadedFiles/${fileId}`;
  try {
    await deleteDoc(doc(db, 'uploadedFiles', fileId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath, true);
  }
}

function safeDocId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export interface CloudWriteResult {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}

function mapSnapshotToProjectLinks(snapshot: QuerySnapshot<DocumentData>): UploadedFileRecord[] {
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: data.id || d.id,
      fileName: data.fileName || 'Untitled',
      fileType: data.fileType || '',
      fileSize: Number(data.fileSize || 0),
      storagePath: data.storagePath || '',
      downloadURL: data.downloadURL || '',
      uploadedAt: data.uploadedAt,
      uploadedBy: data.uploadedBy || '',
      source: data.source || 'google-drive',
      isFolder: Boolean(data.isFolder),
      driveFileId: data.driveFileId,
      driveAccountEmail: data.driveAccountEmail,
      driveAccountName: data.driveAccountName,
      driveAccountPhoto: data.driveAccountPhoto,
      thumbnailLink: data.thumbnailLink || undefined,
      iconLink: data.iconLink || undefined,
      webViewLink: data.webViewLink || undefined,
      webContentLink: data.webContentLink || undefined,
    };
  });
}

function clampStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}

/**
 * Syncs a linked Google Drive item to Firestore `projectLinks`
 * so public visitors across ALL phones and browsers see the curated list.
 */
export async function publishProjectLink(record: UploadedFileRecord): Promise<CloudWriteResult> {
  const { db } = getServices();
  if (!db) {
    return {
      ok: false,
      errorCode: 'firestore-not-initialized',
      errorMessage: 'Firestore is not initialized.',
    };
  }

  try {
    const uploadedAtIso =
      typeof record.uploadedAt === 'string'
        ? clampStr(record.uploadedAt, 64)
        : new Date().toISOString();

    await Promise.race([
      setDoc(doc(db, 'projectLinks', safeDocId(record.id)), {
        id: clampStr(record.id, 255),
        fileName: clampStr(record.fileName || 'Untitled', 300),
        fileType: clampStr(record.fileType || '', 150),
        fileSize: Math.max(0, Number(record.fileSize || 0)),
        storagePath: clampStr(record.storagePath || '', 500),
        downloadURL: clampStr(record.downloadURL || '', 2048),
        uploadedAt: uploadedAtIso,
        uploadedBy: clampStr(record.uploadedBy || '', 320),
        source: clampStr(record.source || 'google-drive', 50),
        isFolder: Boolean(record.isFolder),
        driveFileId: clampStr(record.driveFileId || '', 255),
        driveAccountEmail: clampStr(record.driveAccountEmail || '', 320),
        driveAccountName: clampStr(record.driveAccountName || '', 200),
        driveAccountPhoto: clampStr(record.driveAccountPhoto || '', 2048),
        thumbnailLink: clampStr(record.thumbnailLink || '', 2048),
        iconLink: clampStr(record.iconLink || '', 2048),
        webViewLink: clampStr(record.webViewLink || '', 2048),
        webContentLink: clampStr(record.webContentLink || '', 2048),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Cloud sync timed out.')), 10000)
      ),
    ]);
    return { ok: true };
  } catch (err: any) {
    const code = err?.code || '';
    const message = err?.message || 'Could not publish link to Firestore.';
    console.warn('publishProjectLink notice:', code, message);
    return {
      ok: false,
      errorCode: code || 'write-failed',
      errorMessage: message,
    };
  }
}

export async function unpublishProjectLink(recordId: string): Promise<CloudWriteResult> {
  const { db } = getServices();
  if (!db) {
    return {
      ok: false,
      errorCode: 'firestore-not-initialized',
      errorMessage: 'Firestore is not initialized.',
    };
  }
  try {
    await deleteDoc(doc(db, 'projectLinks', safeDocId(recordId)));
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      errorCode: err?.code || 'delete-failed',
      errorMessage: err?.message || 'Could not remove link from Firestore.',
    };
  }
}

export async function fetchPublicProjectLinks(): Promise<UploadedFileRecord[]> {
  const { db } = getServices();
  if (!db) return [];
  const snapshot = await getDocs(collection(db, 'projectLinks'));
  return mapSnapshotToProjectLinks(snapshot);
}

export function subscribeToPublicProjectLinks(
  onUpdate: (items: UploadedFileRecord[]) => void,
  onError?: (error: any) => void
): () => void {
  const { db } = getServices();
  if (!db) {
    onUpdate([]);
    return () => {};
  }

  let isDisposed = false;
  let receivedLiveUpdate = false;

  // Immediate one-shot REST/fetch read so mobile browsers with slow/blocked
  // streaming WebChannels still load all shared files & folders immediately.
  getDocs(collection(db, 'projectLinks'))
    .then((snapshot) => {
      if (isDisposed || receivedLiveUpdate) return;
      onUpdate(mapSnapshotToProjectLinks(snapshot));
    })
    .catch((err) => {
      if (isDisposed) return;
      if (onError) onError(err);
    });

  try {
    const unsub = onSnapshot(
      collection(db, 'projectLinks'),
      (snapshot) => {
        if (isDisposed) return;
        receivedLiveUpdate = true;
        onUpdate(mapSnapshotToProjectLinks(snapshot));
      },
      (error) => {
        if (isDisposed) return;
        console.warn('projectLinks subscription notice:', error?.code || error?.message);
        if (onError) onError(error);
      }
    );

    return () => {
      isDisposed = true;
      unsub();
    };
  } catch (err) {
    if (onError) onError(err);
    return () => {
      isDisposed = true;
    };
  }
}

