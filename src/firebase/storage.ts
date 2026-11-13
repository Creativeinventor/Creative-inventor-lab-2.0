import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTask,
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
    throw new Error('Firebase Storage is not initialized. Please verify your Firebase project credentials.');
  }

  // Prevent Firebase SDK from hanging silently at 0% for 10 minutes on unreachable/uninitialized buckets
  storage.maxUploadRetryTime = 12000;
  storage.maxOperationRetryTime = 12000;

  const userId = auth?.currentUser?.uid || 'admin';
  const timestamp = Date.now();
  const safeName = sanitizeFileName(file.name);
  const storagePath = `uploads/admin/${timestamp}_${safeName}`;
  const fileRef = ref(storage, storagePath);

  const metadata = {
    contentType: file.type || 'application/octet-stream',
    customMetadata: {
      originalName: file.name,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
    },
  };

  const uploadTask: UploadTask = uploadBytesResumable(fileRef, file, metadata);

  let settled = false;
  let lastProgressBytes = 0;

  const taskPromise = new Promise<StorageUploadResult>((resolve, reject) => {
    // Guard against silent 0% hang (e.g. uninitialized Storage bucket 404 or CORS block)
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
            'Upload timed out at 0%. Ensure Firebase Cloud Storage is enabled in Firebase Console (Build -> Storage -> Get started) for project "creative-inventor-a8723" and check your Storage rules.'
          )
        );
      }
    }, 15000);

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
            'Firebase Cloud Storage bucket is not enabled yet. Open Firebase Console -> Build -> Storage -> Get started for project "creative-inventor-a8723", then retry.';
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
            'Upload timed out. Check that Firebase Cloud Storage is enabled in Firebase Console (Build -> Storage) and verify your network connection.';
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
  });

  return {
    task: taskPromise,
    cancel: () => {
      settled = true;
      uploadTask.cancel();
    },
    pause: () => uploadTask.pause(),
    resume: () => uploadTask.resume(),
  };
}

export async function deleteFileFromStorage(storagePath: string): Promise<void> {
  const { storage } = getServices();
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const fileRef = ref(storage, storagePath);
  try {
    await deleteObject(fileRef);
  } catch (error: any) {
    // If the file was already deleted or doesn't exist in storage, log and continue
    if (error.code === 'storage/object-not-found') {
      console.warn('Storage file not found, proceeding with document deletion:', storagePath);
      return;
    }
    throw error;
  }
}
