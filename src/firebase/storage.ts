import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTask,
  FirebaseStorage,
} from 'firebase/storage';
import { getServices } from './firebase';

export interface StorageUploadResult {
  downloadURL: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export function sanitizeFileName(name: string): string {
  // Replace problematic characters while preserving extension
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function checkBucketExists(bucket: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?maxResults=1`,
      { method: 'GET', signal: controller.signal }
    );
    clearTimeout(timer);
    // 200, 401, or 403 means the bucket exists on Google Cloud Storage.
    // 404 means the bucket has NOT been created/provisioned yet.
    return res.status !== 404;
  } catch {
    // If network check fails/aborts, allow SDK upload attempt to proceed
    return true;
  }
}

async function resolveActiveStorage(
  defaultStorage: FirebaseStorage
): Promise<FirebaseStorage> {
  const { app } = getServices();
  const configuredBucket = defaultStorage.app.options.storageBucket || '';
  if (!configuredBucket || !app) {
    return defaultStorage;
  }

  const primaryExists = await checkBucketExists(configuredBucket);
  if (primaryExists) {
    return defaultStorage;
  }

  // Fallback check on legacy .appspot.com bucket if .firebasestorage.app returned 404
  const projectId = defaultStorage.app.options.projectId;
  if (projectId) {
    const legacyBucket = `${projectId}.appspot.com`;
    if (legacyBucket !== configuredBucket) {
      const legacyExists = await checkBucketExists(legacyBucket);
      if (legacyExists) {
        return getStorage(app, `gs://${legacyBucket}`);
      }
    }
  }

  throw new Error(
    `Firebase Cloud Storage bucket ("${configuredBucket}") does not exist yet (HTTP 404). Open Firebase Console -> Build -> Storage to finish creating your bucket (note: new projects require upgrading to the Blaze plan for Cloud Storage).`
  );
}

export function uploadFileToStorage(
  file: File,
  onProgress?: (progress: number, bytesTransferred: number, totalBytes: number) => void
): {
  task: Promise<StorageUploadResult>;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
} {
  const { storage, auth } = getServices();
  if (!storage) {
    throw new Error(
      'Firebase Storage is not initialized. Please verify your Firebase project credentials.'
    );
  }

  let activeUploadTask: UploadTask | null = null;
  let settled = false;
  let cancelledByUser = false;

  const taskPromise = new Promise<StorageUploadResult>(async (resolve, reject) => {
    try {
      const targetStorage = await resolveActiveStorage(storage);
      if (cancelledByUser || settled) {
        reject(new Error('Upload was canceled.'));
        return;
      }

      // Prevent Firebase SDK from retrying silently for 10 minutes
      targetStorage.maxUploadRetryTime = 15000;
      targetStorage.maxOperationRetryTime = 15000;

      const userId = auth?.currentUser?.uid || 'admin';
      const timestamp = Date.now();
      const safeName = sanitizeFileName(file.name);
      const storagePath = `uploads/admin/${timestamp}_${safeName}`;
      const fileRef = ref(targetStorage, storagePath);

      const metadata = {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          originalName: file.name,
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
        },
      };

      const uploadTask = uploadBytesResumable(fileRef, file, metadata);
      activeUploadTask = uploadTask;

      let lastProgressBytes = 0;

      const stallTimer = setTimeout(() => {
        if (!settled && lastProgressBytes === 0 && file.size > 0) {
          settled = true;
          try {
            uploadTask.cancel();
          } catch {
            // Ignore cancel error
          }
          reject(
            new Error(
              'Upload stalled at 0%. Verify that your Firebase Storage bucket is active and Storage security rules allow uploads for 20sgamingrohit@gmail.com.'
            )
          );
        }
      }, 16000);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.bytesTransferred > lastProgressBytes) {
            lastProgressBytes = snapshot.bytesTransferred;
          }
          const progress =
            snapshot.totalBytes > 0
              ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              : 0;
          if (onProgress) {
            onProgress(
              Math.round(progress),
              snapshot.bytesTransferred,
              snapshot.totalBytes
            );
          }
        },
        (error: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(stallTimer);

          console.error('Storage upload error:', error);
          const code = error?.code || '';
          const serverResponse = String(error?.serverResponse || error?.message || '');

          let errorMsg = 'Failed to upload file to Firebase Cloud Storage.';
          if (
            code === 'storage/bucket-not-found' ||
            code === 'storage/project-not-found' ||
            serverResponse.includes('404') ||
            serverResponse.includes('Not Found')
          ) {
            errorMsg =
              'Firebase Cloud Storage bucket not found (404). Open Firebase Console -> Build -> Storage to create your bucket.';
          } else if (code === 'storage/unauthorized') {
            errorMsg =
              'Permission denied by Firebase Storage security rules. Publish storage.rules under Firebase Console -> Storage -> Rules.';
          } else if (code === 'storage/unauthenticated') {
            errorMsg =
              'Authentication session expired. Please log out and sign in again with 20sgamingrohit@gmail.com.';
          } else if (code === 'storage/canceled') {
            errorMsg = 'Upload was canceled.';
          } else if (code === 'storage/quota-exceeded') {
            errorMsg = 'Firebase Storage quota exceeded for your project.';
          } else if (code === 'storage/retry-limit-exceeded') {
            errorMsg =
              'Upload timed out. Check that Firebase Cloud Storage is provisioned and your network connection is active.';
          }
          reject(new Error(errorMsg));
        },
        async () => {
          if (settled) return;
          clearTimeout(stallTimer);
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            settled = true;
            resolve({
              downloadURL,
              storagePath,
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type || 'application/octet-stream',
            });
          } catch (urlError: any) {
            settled = true;
            reject(
              new Error(
                `File uploaded, but failed to retrieve download URL: ${urlError.message}`
              )
            );
          }
        }
      );
    } catch (preflightErr: any) {
      if (!settled) {
        settled = true;
        reject(preflightErr);
      }
    }
  });

  return {
    task: taskPromise,
    cancel: () => {
      cancelledByUser = true;
      settled = true;
      if (activeUploadTask) {
        activeUploadTask.cancel();
      }
    },
    pause: () => activeUploadTask?.pause(),
    resume: () => activeUploadTask?.resume(),
  };
}

export async function deleteFileFromStorage(storagePath: string): Promise<void> {
  const { storage } = getServices();
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const targetStorage = await resolveActiveStorage(storage);
  const fileRef = ref(targetStorage, storagePath);
  try {
    await deleteObject(fileRef);
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      console.warn('Storage file not found, proceeding with document deletion:', storagePath);
      return;
    }
    throw error;
  }
}
