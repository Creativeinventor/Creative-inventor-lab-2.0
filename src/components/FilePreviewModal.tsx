import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  ExternalLink,
  Download,
  FileText,
  Copy,
  Check,
  AlertCircle,
  FileCode,
  Eye,
  Folder,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { DriveBrowseItem, UploadedFileRecord } from '../types';
import {
  formatFileSize,
  formatDate,
  getFileCategory,
  getFileExtension,
  triggerFileDownload,
} from '../utils/fileHelpers';
import {
  connectGoogleDriveAccount,
  fetchDriveFileBlob,
  fetchDriveTextContent,
  getActiveDriveToken,
  listDriveItems,
  triggerDriveFileDownload,
} from '../firebase/googleDrive';
import { DriveThumbnail } from './DriveThumbnail';

interface FilePreviewModalProps {
  file: UploadedFileRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  isOpen,
  onClose,
}) => {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState<boolean>(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Google Drive authorized blob preview state
  const [driveBlobUrl, setDriveBlobUrl] = useState<string | null>(null);
  const [drivePreviewLoading, setDrivePreviewLoading] = useState<boolean>(false);
  const [activeFile, setActiveFile] = useState<UploadedFileRecord | null>(file);

  // Google Drive folder explorer state
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [folderItems, setFolderItems] = useState<DriveBrowseItem[]>([]);
  const [folderLoading, setFolderLoading] = useState<boolean>(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<boolean>(false);

  useEffect(() => {
    setActiveFile(file);
    if (file?.isFolder && file.driveFileId) {
      setFolderStack([{ id: file.driveFileId, name: file.fileName }]);
    } else {
      setFolderStack([]);
    }
    setFolderItems([]);
    setFolderError(null);
  }, [file]);

  const currentFolder = folderStack[folderStack.length - 1];

  const loadDriveFolderContents = useCallback(async () => {
    if (!activeFile?.isFolder || !activeFile.driveAccountEmail || !currentFolder?.id) {
      return;
    }
    const token = getActiveDriveToken(activeFile.driveAccountEmail);
    if (!token) {
      setFolderItems([]);
      setFolderError('RECONNECT_NEEDED');
      return;
    }

    setFolderLoading(true);
    setFolderError(null);
    try {
      const res = await listDriveItems(activeFile.driveAccountEmail, {
        folderId: currentFolder.id,
      });
      setFolderItems(res.items);
    } catch (err: any) {
      if (err?.message === 'DRIVE_SESSION_EXPIRED') {
        setFolderError('RECONNECT_NEEDED');
      } else {
        setFolderError(err?.message || 'Unable to load Drive folder.');
      }
    } finally {
      setFolderLoading(false);
    }
  }, [activeFile?.isFolder, activeFile?.driveAccountEmail, currentFolder?.id]);

  useEffect(() => {
    if (isOpen && activeFile?.isFolder) {
      loadDriveFolderContents();
    }
  }, [isOpen, activeFile?.isFolder, loadDriveFolderContents]);

  useEffect(() => {
    let revokedUrl: string | null = null;

    if (!activeFile || !isOpen || activeFile.isFolder) {
      setTextContent(null);
      setTextError(null);
      setDriveBlobUrl(null);
      return;
    }

    const category = getFileCategory(activeFile.fileName, activeFile.fileType);
    const ext = getFileExtension(activeFile.fileName).toLowerCase();
    const isDrive = activeFile.source === 'google-drive';

    const isTextLike =
      category === 'code' ||
      ['txt', 'json', 'md', 'csv', 'xml', 'log', 'env'].includes(ext);

    if (isDrive && activeFile.driveFileId && activeFile.driveAccountEmail) {
      const hasToken = Boolean(getActiveDriveToken(activeFile.driveAccountEmail));
      if (hasToken && isTextLike) {
        setLoadingText(true);
        setTextError(null);
        fetchDriveTextContent(
          activeFile.driveFileId,
          activeFile.driveAccountEmail,
          activeFile.fileType
        )
          .then((text) => {
            if (text === null) {
              setTextError('Could not load text preview directly. Use Open in Drive below.');
            } else {
              setTextContent(
                text.length > 100000
                  ? text.slice(0, 100000) + '\n\n... [Content truncated]'
                  : text
              );
            }
          })
          .finally(() => setLoadingText(false));
      } else if (
        hasToken &&
        (category === 'image' || category === 'video' || category === 'audio' || ext === 'pdf')
      ) {
        setDrivePreviewLoading(true);
        fetchDriveFileBlob(
          activeFile.driveFileId,
          activeFile.driveAccountEmail,
          activeFile.fileType
        )
          .then((res) => {
            if (res?.blob) {
              const objUrl = URL.createObjectURL(res.blob);
              revokedUrl = objUrl;
              setDriveBlobUrl(objUrl);
            } else {
              setDriveBlobUrl(null);
            }
          })
          .finally(() => setDrivePreviewLoading(false));
      } else {
        setDriveBlobUrl(null);
      }

      return () => {
        if (revokedUrl) {
          URL.revokeObjectURL(revokedUrl);
        }
      };
    }

    // Standard Firebase Storage URL preview
    if (isTextLike && activeFile.downloadURL) {
      setLoadingText(true);
      setTextError(null);
      fetch(activeFile.downloadURL)
        .then((res) => {
          if (!res.ok) throw new Error('Could not read file contents');
          return res.text();
        })
        .then((text) => {
          if (text.length > 100000) {
            setTextContent(
              text.slice(0, 100000) + '\n\n... [Content truncated for preview performance]'
            );
          } else {
            setTextContent(text);
          }
        })
        .catch((err) => {
          console.warn('Failed to load text preview:', err);
          setTextError(
            'Preview unavailable directly (CORS or network policy). Click Open in New Tab below.'
          );
        })
        .finally(() => {
          setLoadingText(false);
        });
    }

    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [activeFile, isOpen]);

  if (!isOpen || !activeFile) return null;

  const isDrive = activeFile.source === 'google-drive';
  const isFolder = Boolean(activeFile.isFolder);
  const category = isFolder ? 'folder' : getFileCategory(activeFile.fileName, activeFile.fileType);
  const ext = isFolder
    ? 'FOLDER'
    : getFileExtension(activeFile.fileName) || (isDrive ? 'DRIVE' : 'FILE');

  const resolvedMediaUrl = isDrive
    ? driveBlobUrl || activeFile.thumbnailLink || ''
    : activeFile.downloadURL;

  const driveOpenUrl = activeFile.webViewLink || activeFile.downloadURL;
  const hasActiveDriveSession = Boolean(
    isDrive && activeFile.driveAccountEmail && getActiveDriveToken(activeFile.driveAccountEmail)
  );

  const handleCopyText = () => {
    if (textContent) {
      navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReconnectDrive = async () => {
    if (!activeFile.driveAccountEmail) return;
    setReconnecting(true);
    try {
      await connectGoogleDriveAccount(activeFile.driveAccountEmail);
      if (isFolder) {
        loadDriveFolderContents();
      } else {
        setActiveFile({ ...activeFile });
      }
    } catch {
      // Handled via error display if needed
    } finally {
      setReconnecting(false);
    }
  };

  const handleDownload = () => {
    if (isDrive) {
      triggerDriveFileDownload(activeFile);
    } else {
      triggerFileDownload(activeFile.downloadURL, activeFile.fileName);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="p-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg shrink-0">
              {isFolder ? <Folder className="w-5 h-5 text-amber-400" /> : <Eye className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate font-mono">
                {activeFile.fileName}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded text-cyan-300 font-mono font-bold">
                  {ext}
                </span>
                {isDrive && activeFile.driveAccountEmail && (
                  <>
                    <span>•</span>
                    <span className="text-cyan-300 font-mono truncate max-w-[200px]">
                      {activeFile.driveAccountEmail}
                    </span>
                  </>
                )}
                {!isFolder && (
                  <>
                    <span>•</span>
                    <span>
                      {activeFile.fileSize > 0
                        ? formatFileSize(activeFile.fileSize)
                        : 'Google Drive File'}
                    </span>
                  </>
                )}
                <span>•</span>
                <span>{formatDate(activeFile.uploadedAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {driveOpenUrl && (
              <a
                href={driveOpenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                title={isDrive ? 'Open in Google Drive' : 'Open raw file in new tab'}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {!isFolder && (
              <button
                type="button"
                onClick={handleDownload}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Download file"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition cursor-pointer"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-950/40 flex flex-col items-center justify-center min-h-[300px]">
          {/* Linked Google Drive Folder Explorer */}
          {isFolder && (
            <div className="w-full h-full flex flex-col gap-3">
              {/* Folder Breadcrumbs */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs font-mono">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {folderStack.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFolderStack((prev) => prev.slice(0, -1))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {folderStack.map((entry, idx) => (
                    <React.Fragment key={entry.id}>
                      {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                      <button
                        type="button"
                        onClick={() => setFolderStack((prev) => prev.slice(0, idx + 1))}
                        className={`px-2 py-0.5 rounded cursor-pointer whitespace-nowrap ${
                          idx === folderStack.length - 1
                            ? 'bg-amber-500/15 text-amber-300 font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {entry.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                {driveOpenUrl && (
                  <a
                    href={driveOpenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-300 hover:text-cyan-200 flex items-center gap-1 text-[11px]"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open in Google Drive</span>
                  </a>
                )}
              </div>

              {folderError === 'RECONNECT_NEEDED' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
                  <HardDrive className="w-10 h-10 text-amber-400 mb-3" />
                  <p className="text-sm font-bold text-white mb-1">
                    Connect {activeFile.driveAccountEmail} to Browse Folder
                  </p>
                  <p className="text-xs text-slate-400 max-w-md mb-5">
                    Tap below to verify access to this Google Drive and inspect every file and subfolder inside "{activeFile.fileName}".
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleReconnectDrive}
                      disabled={reconnecting}
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? 'animate-spin' : ''}`} />
                      <span>{reconnecting ? 'Connecting...' : 'Reconnect Google Drive'}</span>
                    </button>
                    {driveOpenUrl && (
                      <a
                        href={driveOpenUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Folder in Drive</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {folderError && folderError !== 'RECONNECT_NEEDED' && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
                  {folderError}
                </div>
              )}

              {folderLoading && (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <div className="w-7 h-7 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                  <span className="text-xs font-mono">Loading folder contents from Drive...</span>
                </div>
              )}

              {!folderLoading && !folderError && folderItems.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400">
                  <Folder className="w-10 h-10 text-slate-600 mb-2" />
                  <p className="text-xs font-mono">This Drive folder is empty.</p>
                </div>
              )}

              {!folderLoading && !folderError && folderItems.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto">
                  {folderItems.map((child) => (
                    <div
                      key={child.id}
                      className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3"
                    >
                      <div
                        className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                        onClick={() => {
                          if (child.isFolder) {
                            setFolderStack((prev) => [...prev, { id: child.id, name: child.name }]);
                          } else {
                            setActiveFile({
                              id: `preview_${child.id}`,
                              fileName: child.name,
                              fileType: child.mimeType,
                              fileSize: child.size,
                              storagePath: `Google Drive (${activeFile.driveAccountEmail})`,
                              downloadURL: child.webContentLink || child.webViewLink || '',
                              uploadedAt: child.modifiedTime,
                              uploadedBy: activeFile.driveAccountEmail || 'Google Drive',
                              source: 'google-drive',
                              isFolder: false,
                              driveFileId: child.id,
                              driveAccountEmail: activeFile.driveAccountEmail,
                              thumbnailLink: child.thumbnailLink,
                              webViewLink: child.webViewLink,
                              webContentLink: child.webContentLink,
                            });
                          }
                        }}
                      >
                        <DriveThumbnail
                          fileName={child.name}
                          mimeType={child.mimeType}
                          isFolder={child.isFolder}
                          thumbnailLink={child.thumbnailLink}
                          driveFileId={child.id}
                          driveAccountEmail={activeFile.driveAccountEmail}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate font-mono hover:text-cyan-300">
                            {child.name}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {child.isFolder
                              ? 'Folder'
                              : child.size > 0
                              ? formatFileSize(child.size)
                              : 'Google File'}
                          </p>
                        </div>
                      </div>

                      {child.webViewLink && (
                        <a
                          href={child.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white shrink-0"
                          title="Open in Google Drive"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Non-folder File Previews */}
          {!isFolder && drivePreviewLoading && (
            <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-12">
              <div className="w-7 h-7 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-xs font-mono">Loading preview from Google Drive...</span>
            </div>
          )}

          {!isFolder && !drivePreviewLoading && category === 'image' && resolvedMediaUrl && (
            <div className="flex flex-col items-center justify-center max-h-full">
              <img
                src={resolvedMediaUrl}
                alt={activeFile.fileName}
                referrerPolicy="no-referrer"
                className="max-h-[65vh] max-w-full rounded-xl object-contain shadow-xl border border-slate-800"
              />
            </div>
          )}

          {!isFolder && !drivePreviewLoading && category === 'video' && (driveBlobUrl || !isDrive) && (
            <div className="w-full flex justify-center">
              <video
                controls
                autoPlay
                className="max-h-[65vh] max-w-full rounded-xl shadow-xl bg-black border border-slate-800"
              >
                <source src={isDrive ? driveBlobUrl! : activeFile.downloadURL} type={activeFile.fileType} />
                Your browser does not support the video tag.
              </video>
            </div>
          )}

          {!isFolder && !drivePreviewLoading && category === 'audio' && (driveBlobUrl || !isDrive) && (
            <div className="w-full max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center text-center shadow-xl">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center mb-6 animate-pulse">
                <FileCode className="w-10 h-10 text-cyan-400" />
              </div>
              <h4 className="text-white font-medium mb-1 truncate max-w-xs">{activeFile.fileName}</h4>
              <p className="text-xs text-slate-400 mb-6 font-mono">{formatFileSize(activeFile.fileSize)}</p>
              <audio controls className="w-full">
                <source src={isDrive ? driveBlobUrl! : activeFile.downloadURL} type={activeFile.fileType} />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {!isFolder && !drivePreviewLoading && ext.toLowerCase() === 'pdf' && (driveBlobUrl || !isDrive) && (
            <div className="w-full h-[65vh] flex flex-col">
              <object
                data={isDrive ? driveBlobUrl! : activeFile.downloadURL}
                type="application/pdf"
                className="w-full h-full rounded-xl border border-slate-800"
              >
                <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-slate-900 rounded-xl">
                  <FileText className="w-16 h-16 text-cyan-400 mb-4" />
                  <p className="text-white font-medium mb-2">PDF Document Ready</p>
                  <p className="text-sm text-slate-400 mb-4">Direct embedded preview not supported in this frame.</p>
                  <a
                    href={driveOpenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open PDF in New Window
                  </a>
                </div>
              </object>
            </div>
          )}

          {!isFolder &&
            (category === 'code' ||
              ['txt', 'json', 'md', 'csv', 'xml', 'log', 'env'].includes(ext.toLowerCase())) &&
            (!isDrive || hasActiveDriveSession) && (
              <div className="w-full h-full max-h-[65vh] flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs">
                  <span className="text-slate-400 font-mono">Document Content ({ext})</span>
                  {textContent && (
                    <button
                      type="button"
                      onClick={handleCopyText}
                      className="flex items-center gap-1.5 text-slate-300 hover:text-white px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded transition cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre selection:bg-cyan-500/30 selection:text-cyan-200">
                  {loadingText && (
                    <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
                      <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                      <span>Loading file content...</span>
                    </div>
                  )}
                  {textError && (
                    <div className="flex items-center gap-2 text-amber-400 p-4 bg-amber-500/10 rounded-lg">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span>{textError}</span>
                    </div>
                  )}
                  {!loadingText && !textError && textContent}
                </div>
              </div>
            )}

          {!isFolder &&
            !drivePreviewLoading &&
            !(category === 'image' && resolvedMediaUrl) &&
            !(category === 'video' && (driveBlobUrl || !isDrive)) &&
            !(category === 'audio' && (driveBlobUrl || !isDrive)) &&
            !(ext.toLowerCase() === 'pdf' && (driveBlobUrl || !isDrive)) &&
            !(
              (category === 'code' ||
                ['txt', 'json', 'md', 'csv', 'xml', 'log', 'env'].includes(ext.toLowerCase())) &&
              (!isDrive || hasActiveDriveSession)
            ) && (
              <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full">
                {activeFile.thumbnailLink ? (
                  <img
                    src={activeFile.thumbnailLink}
                    alt={activeFile.fileName}
                    referrerPolicy="no-referrer"
                    className="w-40 h-40 object-contain rounded-xl border border-slate-800 bg-slate-950 mb-4"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                    <FileText className="w-10 h-10" />
                  </div>
                )}
                <h4 className="text-lg font-bold text-white mb-1 font-mono break-all">
                  {activeFile.fileName}
                </h4>
                <p className="text-sm text-slate-400 mb-6">
                  {ext} file {activeFile.fileSize > 0 ? `• ${formatFileSize(activeFile.fileSize)}` : ''}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {isDrive && !hasActiveDriveSession && activeFile.driveAccountEmail && (
                    <button
                      type="button"
                      onClick={handleReconnectDrive}
                      disabled={reconnecting}
                      className="px-4 py-2.5 bg-cyan-500/15 border border-cyan-500/40 hover:bg-cyan-500/25 text-cyan-200 font-semibold rounded-xl text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${reconnecting ? 'animate-spin' : ''}`} />
                      <span>{reconnecting ? 'Connecting...' : 'Load Live Preview'}</span>
                    </button>
                  )}
                  {driveOpenUrl && (
                    <a
                      href={driveOpenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-xs sm:text-sm flex items-center gap-2 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>{isDrive ? 'Open in Google Drive' : 'Open in Browser'}</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download File</span>
                  </button>
                </div>
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono truncate">Source: {activeFile.storagePath}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
