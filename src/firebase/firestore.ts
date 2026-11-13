import {
  collection,
  addDoc,
  deleteDoc,
  setDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
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

/**
 * Best-effort cloud sync for Google Drive links to Firestore `projectLinks`
 * so public visitors across devices see the same curated list when Firestore is active.
 * Never throws or blocks local persistence if Firestore is unprovisioned.
 */
export async function publishProjectLink(record: UploadedFileRecord): Promise<void> {
  const { db } = getServices();
  if (!db) return;
  try {
    await setDoc(doc(db, 'projectLinks', safeDocId(record.id)), {
      id: record.id,
      fileName: record.fileName,
      fileType: record.fileType || '',
      fileSize: record.fileSize || 0,
      storagePath: record.storagePath || '',
      downloadURL: record.downloadURL || '',
      uploadedAt: typeof record.uploadedAt === 'string' ? record.uploadedAt : new Date().toISOString(),
      uploadedBy: record.uploadedBy || '',
      source: record.source || 'google-drive',
      isFolder: Boolean(record.isFolder),
      driveFileId: record.driveFileId || '',
      driveAccountEmail: record.driveAccountEmail || '',
      driveAccountName: record.driveAccountName || '',
      driveAccountPhoto: record.driveAccountPhoto || '',
      thumbnailLink: record.thumbnailLink || '',
      iconLink: record.iconLink || '',
      webViewLink: record.webViewLink || '',
      webContentLink: record.webContentLink || '',
    });
  } catch {
    // Non-fatal fallback: localStorage persistence remains active
  }
}

export async function unpublishProjectLink(recordId: string): Promise<void> {
  const { db } = getServices();
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'projectLinks', safeDocId(recordId)));
  } catch {
    // Non-fatal
  }
}

export function subscribeToPublicProjectLinks(
  onUpdate: (items: UploadedFileRecord[]) => void
): () => void {
  const { db } = getServices();
  if (!db) return () => {};

  try {
    return onSnapshot(
      collection(db, 'projectLinks'),
      (snapshot) => {
        const items: UploadedFileRecord[] = snapshot.docs.map((d) => {
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
        onUpdate(items);
      },
      () => {
        // Silently ignore if Firestore projectLinks is unavailable
      }
    );
  } catch {
    return () => {};
  }
}

