export interface UploadedFileRecord {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  downloadURL: string;
  uploadedAt: any;
  uploadedBy: string;
  // Google Drive integration fields
  source?: 'firebase' | 'google-drive';
  isFolder?: boolean;
  driveFileId?: string;
  driveAccountEmail?: string;
  driveAccountName?: string;
  driveAccountPhoto?: string;
  thumbnailLink?: string;
  iconLink?: string;
  webViewLink?: string;
  webContentLink?: string;
}

export interface DriveAccountInfo {
  email: string;
  displayName: string;
  photoURL?: string;
  connected: boolean;
  connectedAt?: number;
}

export interface DriveBrowseItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number;
  modifiedTime: string;
  thumbnailLink?: string;
  iconLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
  trashed?: boolean;
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
  | 'folder'
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
