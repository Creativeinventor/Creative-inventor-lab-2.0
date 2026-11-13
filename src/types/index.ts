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
  measurementId?: string;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  username: string;
  photoURL?: string | null;
}

export interface AdminUserProfile {
  uid: string;
  username: string;
  password?: string;
  authEmail: string;
  updatedAt?: any;
  createdAt?: any;
  lastUpdated?: string;
  lastPasswordChange?: any;
  lastLoginAt?: any;
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
