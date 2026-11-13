import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import {
  UploadCloud,
  File as FileIcon,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Download,
  ArrowUpRight,
  FileCode,
  FileText,
  FileArchive,
  Image as ImageIcon,
  Video,
  Music,
  Cpu,
  Layers,
} from 'lucide-react';
import { uploadFileToStorage } from '../firebase/storage';
import { saveUploadedFileMetadata } from '../firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { UploadProgressState, UploadedFileRecord } from '../types';
import {
  formatFileSize,
  formatDate,
  getFileExtension,
  getFileCategory,
  triggerFileDownload,
} from '../utils/fileHelpers';

interface FileUploadProps {
  onUploadSuccess?: (record: UploadedFileRecord) => void;
  onPreviewFile?: (file: UploadedFileRecord) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadSuccess,
  onPreviewFile,
}) => {
  const { user, isConfigured } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelUploadRef = useRef<(() => void) | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadState, setUploadState] = useState<UploadProgressState>({
    file: null,
    progress: 0,
    bytesTransferred: 0,
    totalBytes: 0,
    status: 'idle',
  });
  const [lastUploaded, setLastUploaded] = useState<UploadedFileRecord | null>(null);

  const handleSelectFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadState({
        file,
        progress: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
        status: 'idle',
      });
      setLastUploaded(null);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setUploadState({
        file,
        progress: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
        status: 'idle',
      });
      setLastUploaded(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadState({
      file: null,
      progress: 0,
      bytesTransferred: 0,
      totalBytes: 0,
      status: 'idle',
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderCategoryIcon = (category: string) => {
    switch (category) {
      case 'image':
        return <ImageIcon className="w-8 h-8 text-emerald-400" />;
      case 'video':
        return <Video className="w-8 h-8 text-indigo-400" />;
      case 'audio':
        return <Music className="w-8 h-8 text-pink-400" />;
      case 'code':
        return <FileCode className="w-8 h-8 text-cyan-400" />;
      case 'hardware':
        return <Cpu className="w-8 h-8 text-amber-400" />;
      case 'archive':
        return <FileArchive className="w-8 h-8 text-violet-400" />;
      case 'document':
        return <FileText className="w-8 h-8 text-blue-400" />;
      default:
        return <FileIcon className="w-8 h-8 text-slate-300" />;
    }
  };

  const handleCancelUpload = () => {
    if (cancelUploadRef.current) {
      cancelUploadRef.current();
      cancelUploadRef.current = null;
    }
    setUploadState((prev) => ({
      ...prev,
      status: 'error',
      errorMessage: 'Upload cancelled by administrator.',
    }));
  };

  const handleStartUpload = async () => {
    if (!selectedFile) return;

    if (!isConfigured) {
      setUploadState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: 'Firebase is not configured. Please ensure VITE_FIREBASE_* environment variables are set in .env.local or Vercel.',
      }));
      return;
    }

    setUploadState((prev) => ({
      ...prev,
      status: 'uploading',
      progress: 0,
      bytesTransferred: 0,
      totalBytes: selectedFile.size,
      errorMessage: undefined,
    }));

    try {
      const { task, cancel } = uploadFileToStorage(
        selectedFile,
        (progress, transferred, total) => {
          setUploadState((prev) => ({
            ...prev,
            progress,
            bytesTransferred: transferred,
            totalBytes: total,
          }));
        }
      );
      cancelUploadRef.current = cancel;

      const storageResult = await task;
      cancelUploadRef.current = null;

      // Save metadata in Firestore
      const recordId = await saveUploadedFileMetadata({
        fileName: storageResult.fileName,
        fileType: storageResult.fileType,
        fileSize: storageResult.fileSize,
        storagePath: storageResult.storagePath,
        downloadURL: storageResult.downloadURL,
        uploadedBy: user?.uid || 'admin',
      });

      const newRecord: UploadedFileRecord = {
        id: recordId || Date.now().toString(),
        fileName: storageResult.fileName,
        fileType: storageResult.fileType,
        fileSize: storageResult.fileSize,
        storagePath: storageResult.storagePath,
        downloadURL: storageResult.downloadURL,
        uploadedAt: new Date(),
        uploadedBy: user?.uid || 'admin',
      };

      setUploadState((prev) => ({
        ...prev,
        status: 'success',
        result: newRecord,
      }));
      setLastUploaded(newRecord);

      if (onUploadSuccess) {
        onUploadSuccess(newRecord);
      }
    } catch (err: any) {
      cancelUploadRef.current = null;
      console.error('Upload failed:', err);
      // NOTE: Do not clear the selected file if an upload fails! Allow retrying!
      setUploadState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: err?.message || 'Upload failed. Check your Firebase Storage configuration.',
      }));
    }
  };

  const ext = selectedFile ? getFileExtension(selectedFile.name) : '';
  const category = selectedFile ? getFileCategory(selectedFile.name, selectedFile.type) : 'other';

  return (
    <div className="w-full">
      {/* Hidden standard file input supporting both mobile & desktop */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        aria-label="Select file"
      />

      {/* Main Upload Card */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative w-full rounded-3xl p-6 sm:p-10 border-2 transition-all duration-300 overflow-hidden ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/30 scale-[1.01] shadow-2xl shadow-cyan-500/20'
            : 'border-slate-800 hover:border-slate-700 bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950/80 shadow-2xl'
        }`}
      >
        {/* Decorative background glows */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* State 1: No file selected */}
        {!selectedFile && (
          <div className="flex flex-col items-center justify-center text-center py-6 sm:py-8">
            <div className="relative mb-6 group cursor-pointer" onClick={handleSelectFileClick}>
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center group-hover:scale-105 group-hover:border-cyan-400 transition-all shadow-xl shadow-cyan-500/10">
                <UploadCloud className="w-12 h-12 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-cyan-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-md">
                +
              </div>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
              Choose a file from your device
            </h3>
            <p className="text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
              Drag and drop any file here, or click select. We support engineering files, CAD, firmware, documents, archives, videos, code, and images.
            </p>

            <button
              type="button"
              onClick={handleSelectFileClick}
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500 text-slate-950 font-extrabold text-sm sm:text-base shadow-xl shadow-cyan-500/25 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex items-center gap-2.5"
            >
              <UploadCloud className="w-5 h-5 text-slate-950" />
              <span>SELECT FILE</span>
            </button>

            <div className="mt-8 pt-6 border-t border-slate-800/80 w-full max-w-2xl flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300">PDF</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300">ZIP / RAR</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300">HEX / BIN / INO</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300">DOCX / XLSX</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300">MP4 / MKV</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300">JPG / PNG</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300">C++ / PY / JS</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300">All Formats</span>
            </div>
          </div>
        )}

        {/* State 2: File Selected (Ready to Upload or Uploading) */}
        {selectedFile && uploadState.status !== 'success' && (
          <div className="space-y-6">
            {/* Selected File Details Box */}
            <div className="p-5 sm:p-6 bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                <div className="p-3.5 bg-slate-900 border border-slate-700/80 rounded-2xl shrink-0">
                  {renderCategoryIcon(category)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-base sm:text-lg font-bold text-white truncate font-mono">
                      {selectedFile.name}
                    </h4>
                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono font-bold shrink-0">
                      {ext || 'FILE'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">{formatFileSize(selectedFile.size)}</span>
                    <span>•</span>
                    <span className="capitalize">{category}</span>
                    <span>•</span>
                    <span className="truncate max-w-[180px] text-slate-400 font-mono">
                      {selectedFile.type || 'application/octet-stream'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons (Change / Remove) */}
              {uploadState.status !== 'uploading' && (
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                  <button
                    type="button"
                    onClick={handleSelectFileClick}
                    className="px-3 py-1.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    CHANGE FILE
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 transition cursor-pointer"
                    title="Remove selected file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Upload Progress Bar (when uploading) */}
            {uploadState.status === 'uploading' && (
              <div className="p-6 bg-slate-950/90 border border-cyan-500/30 rounded-2xl space-y-3 glow-cyan">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-cyan-300 font-semibold flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                    Uploading to Firebase Cloud Storage...
                  </span>
                  <span className="font-mono text-lg font-extrabold text-cyan-400">
                    {uploadState.progress}%
                  </span>
                </div>

                {/* Progress bar container */}
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 transition-all duration-200 shadow-lg shadow-cyan-500/50"
                    style={{ width: `${uploadState.progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                  <span>
                    {formatFileSize(uploadState.bytesTransferred)} / {formatFileSize(uploadState.totalBytes)}
                  </span>
                  <div className="flex items-center gap-3">
                    <span>Resumable Cloud Upload</span>
                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[11px] font-semibold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message & Retry (if failed) */}
            {uploadState.status === 'error' && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-bold text-red-200">Upload Encountered an Issue</h5>
                    <p className="text-xs text-red-300/90 mt-0.5">{uploadState.errorMessage}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleStartUpload}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>RETRY UPLOAD</span>
                </button>
              </div>
            )}

            {/* Upload Button */}
            {uploadState.status !== 'uploading' && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="text-xs text-slate-400 font-mono">
                  Destination: <span className="text-cyan-400">Firebase Storage /uploads/admin/</span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="flex-1 sm:flex-none px-5 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition cursor-pointer"
                  >
                    REMOVE FILE
                  </button>
                  <button
                    type="button"
                    onClick={handleStartUpload}
                    className="flex-1 sm:flex-none px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500 text-slate-950 font-extrabold text-sm shadow-xl shadow-cyan-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ArrowUpRight className="w-4 h-4 text-slate-950" />
                    <span>UPLOAD FILE</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* State 3: Upload Success Banner */}
        {uploadState.status === 'success' && lastUploaded && (
          <div className="p-6 sm:p-8 bg-gradient-to-b from-slate-950 to-slate-900 border border-emerald-500/40 rounded-2xl space-y-6 glow-card animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-lg font-extrabold text-white tracking-wide">
                  FILE UPLOADED SUCCESSFULLY!
                </h4>
                <p className="text-xs text-emerald-300/90 font-mono">
                  Stored securely in Firebase Cloud Storage & metadata indexed in Firestore
                </p>
              </div>
            </div>

            {/* Metadata Summary Card */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">File Name</span>
                <span className="text-white font-medium truncate block mt-0.5">{lastUploaded.fileName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Size</span>
                <span className="text-cyan-300 font-medium block mt-0.5">{formatFileSize(lastUploaded.fileSize)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">File Type</span>
                <span className="text-slate-300 font-medium block mt-0.5 truncate">{lastUploaded.fileType}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Uploaded At</span>
                <span className="text-purple-300 font-medium block mt-0.5">{formatDate(lastUploaded.uploadedAt)}</span>
              </div>
            </div>

            {/* Action buttons (Open & Download work on mobile & desktop) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onPreviewFile && onPreviewFile(lastUploaded)}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>OPEN FILE</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(lastUploaded.downloadURL, lastUploaded.fileName)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>DOWNLOAD FILE</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleRemoveFile}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Upload Another File</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
