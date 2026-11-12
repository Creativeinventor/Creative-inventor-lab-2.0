export interface UploadedFileRecord {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  downloadURL: string;
  uploadedAt: any;
  uploadedBy: string;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isDemo?: boolean;
}

export type FileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'code'
  | 'archive'
  | 'hardware'
  | 'other';

export interface UploadProgressState {
  file: File | null;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  status: 'idle' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
  result?: UploadedFileRecord;
}
