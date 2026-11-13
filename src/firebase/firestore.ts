import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocs,
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(error instanceof Error ? error.message : String(error));
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
    handleFirestoreError(error, OperationType.CREATE, collectionPath);
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

  try {
    // Try ordered query first
    const q = query(collection(db, collectionPath), orderBy('uploadedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
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
        console.warn('Ordered query on uploadedFiles failed, falling back to unordered query:', error);
        // Fallback without orderBy in case index or permissions error on order
        try {
          const fallbackUnsub = onSnapshot(
            collection(db, collectionPath),
            (snapshot) => {
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
              // Sort descending in memory
              files.sort((a, b) => {
                const timeA = a.uploadedAt?.seconds || 0;
                const timeB = b.uploadedAt?.seconds || 0;
                return timeB - timeA;
              });
              onUpdate(files);
            },
            (fallbackErr) => {
              handleFirestoreError(fallbackErr, OperationType.LIST, collectionPath);
              onError(fallbackErr);
            }
          );
          return fallbackUnsub;
        } catch (e) {
          onError(e);
        }
      }
    );

    return unsubscribe;
  } catch (error) {
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
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
