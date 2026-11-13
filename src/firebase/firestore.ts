import {
  collection,
  addDoc,
  deleteDoc,
  setDoc,
  getDocs,
  getDocFromServer,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  QuerySnapshot,
  DocumentData,
  Firestore,
} from 'firebase/firestore';
import { getServices, getProvisionedPublicDb } from './firebase';
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
        fileSize: Number.isFinite(Number(record.fileSize))
          ? Math.max(0, Number(record.fileSize))
          : 0,
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
        setTimeout(() => reject(new Error('Cloud sync timed out.')), 20000)
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

export async function checkCloudProjectLinksHealth(): Promise<{
  ok: boolean;
  count: number;
  errorCode?: string;
  errorMessage?: string;
}> {
  const { db } = getServices();
  if (!db) {
    return {
      ok: false,
      count: 0,
      errorCode: 'firestore-not-initialized',
      errorMessage: 'Firestore is not initialized.',
    };
  }
  try {
    const snapshot = await getDocs(collection(db, 'projectLinks'));
    return { ok: true, count: snapshot.size };
  } catch (err: any) {
    return {
      ok: false,
      count: 0,
      errorCode: err?.code || 'read-failed',
      errorMessage: err?.message || 'Could not read projectLinks from Firestore.',
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
  const provisionedDb = getProvisionedPublicDb();

  const targets: Firestore[] = [];
  if (db) targets.push(db);
  if (provisionedDb && provisionedDb !== db) targets.push(provisionedDb);

  if (targets.length === 0) {
    onUpdate([]);
    return () => {};
  }

  let isDisposed = false;
  const itemsBySource = new Map<number, UploadedFileRecord[]>();
  const failedSources = new Set<number>();
  const unsubs: Array<() => void> = [];

  // Validate connection cleanly on boot
  getDocFromServer(doc(targets[targets.length - 1], 'projectLinks', '_connection_check')).catch(() => {});

  const emitMerged = () => {
    if (isDisposed) return;
    const merged = new Map<string, UploadedFileRecord>();
    for (const list of itemsBySource.values()) {
      for (const item of list) {
        merged.set(item.id, item);
      }
    }
    onUpdate(Array.from(merged.values()));
  };

  const handleSourceError = (idx: number, err: any) => {
    if (isDisposed) return;
    failedSources.add(idx);
    if (failedSources.size === targets.length && onError) {
      onError(err);
    }
  };

  targets.forEach((targetDb, idx) => {
    let receivedLive = false;

    getDocs(collection(targetDb, 'projectLinks'))
      .then((snapshot) => {
        if (isDisposed || receivedLive) return;
        itemsBySource.set(idx, mapSnapshotToProjectLinks(snapshot));
        emitMerged();
      })
      .catch((err) => {
        handleSourceError(idx, err);
      });

    try {
      const unsub = onSnapshot(
        collection(targetDb, 'projectLinks'),
        (snapshot) => {
          if (isDisposed) return;
          receivedLive = true;
          itemsBySource.set(idx, mapSnapshotToProjectLinks(snapshot));
          emitMerged();
        },
        (error) => {
          if (isDisposed) return;
          console.warn('projectLinks subscription notice:', error?.code || error?.message);
          handleSourceError(idx, error);
        }
      );
      unsubs.push(unsub);
    } catch (err) {
      handleSourceError(idx, err);
    }
  });

  return () => {
    isDisposed = true;
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        // Ignore cleanup error
      }
    });
  };
}

