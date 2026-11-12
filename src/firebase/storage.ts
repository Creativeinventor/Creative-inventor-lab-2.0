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

  const taskPromise = new Promise<StorageUploadResult>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.totalBytes > 0
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
      (error) => {
        console.error('Storage upload error:', error);
        let errorMsg = 'Failed to upload file to Cloud Storage.';
        if (error.code === 'storage/unauthorized') {
          errorMsg = 'Permission denied by Firebase Storage security rules. Check your storage.rules.';
        } else if (error.code === 'storage/canceled') {
          errorMsg = 'Upload was canceled.';
        } else if (error.code === 'storage/quota-exceeded') {
          errorMsg = 'Firebase Storage quota exceeded for your project.';
        } else if (error.code === 'storage/retry-limit-exceeded') {
          errorMsg = 'Upload failed due to network timeout. Please retry.';
        }
        reject(new Error(errorMsg));
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            downloadURL,
            storagePath,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'application/octet-stream',
          });
        } catch (urlError: any) {
          reject(new Error(`File uploaded, but failed to retrieve download URL: ${urlError.message}`));
        }
      }
    );
  });

  return {
    task: taskPromise,
    cancel: () => uploadTask.cancel(),
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
