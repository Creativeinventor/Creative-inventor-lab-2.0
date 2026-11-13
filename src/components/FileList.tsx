import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  LayoutGrid,
  List,
  RefreshCw,
  FolderOpen,
  Filter,
  ExternalLink,
  Download,
  Trash2,
  HardDrive,
  CheckCircle2,
} from 'lucide-react';
import { UploadedFileRecord } from '../types';
import {
  subscribeToUploadedFiles,
  subscribeToPublicProjectLinks,
  deleteUploadedFileMetadata,
} from '../firebase/firestore';
import { deleteFileFromStorage } from '../firebase/storage';
import {
  getKnownAndConnectedDriveAccounts,
  getLinkedDriveItems,
  removeLinkedDriveItem,
  subscribeToDriveState,
  syncLinkedItemsWithDrive,
  triggerDriveFileDownload,
} from '../firebase/googleDrive';
import { FileCard } from './FileCard';
import { ConfirmDialog } from './ConfirmDialog';
import { DriveThumbnail } from './DriveThumbnail';
import {
  formatFileSize,
  formatDate,
  getFileCategory,
  getFileExtension,
  triggerFileDownload,
} from '../utils/fileHelpers';

interface FileListProps {
  onOpenFile: (file: UploadedFileRecord) => void;
  refreshTrigger?: number;
  readOnly?: boolean;
}

export const FileList: React.FC<FileListProps> = ({
  onOpenFile,
  refreshTrigger,
  readOnly = false,
}) => {
  const [firebaseFiles, setFirebaseFiles] = useState<UploadedFileRecord[]>([]);
  const [cloudProjectLinks, setCloudProjectLinks] = useState<UploadedFileRecord[]>([]);
  const [driveLinks, setDriveLinks] = useState<UploadedFileRecord[]>(() =>
    getLinkedDriveItems()
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'largest' | 'smallest' | 'name'>('newest');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Deletion state
  const [fileToDelete, setFileToDelete] = useState<UploadedFileRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Subscribe to persistent Google Drive links updates
  useEffect(() => {
    const refreshDriveLinks = () => {
      setDriveLinks(getLinkedDriveItems());
    };
    refreshDriveLinks();
    return subscribeToDriveState(refreshDriveLinks);
  }, [refreshTrigger]);

  // Subscribe to public projectLinks collection (cross-device shared list)
  useEffect(() => {
    const unsub = subscribeToPublicProjectLinks((items) => {
      setCloudProjectLinks(items);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [refreshTrigger]);

  // Subscribe to real-time updates from Firestore (only in Admin mode)
  useEffect(() => {
    if (readOnly) {
      setLoading(false);
      return;
    }

    let resolved = false;
    const safetyTimer = setTimeout(() => {
      if (!resolved) {
        setLoading(false);
      }
    }, 1500);

    const unsubscribe = subscribeToUploadedFiles(
      (updatedFiles) => {
        resolved = true;
        clearTimeout(safetyTimer);
        setFirebaseFiles(updatedFiles);
        setLoading(false);
        setIsRefreshing(false);
      },
      (error) => {
        resolved = true;
        clearTimeout(safetyTimer);
        console.warn('Firestore notice in FileList:', error);
        setLoading(false);
        setIsRefreshing(false);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [refreshTrigger, readOnly]);

  const files = useMemo(() => {
    const map = new Map<string, UploadedFileRecord>();
    for (const item of cloudProjectLinks) {
      map.set(item.id, item);
    }
    for (const item of driveLinks) {
      map.set(item.id, item);
    }
    if (!readOnly) {
      for (const item of firebaseFiles) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values());
  }, [driveLinks, cloudProjectLinks, firebaseFiles, readOnly]);

  const driveAccountsInLinks = useMemo(() => {
    const emails = new Set<string>();
    for (const item of driveLinks) {
      if (item.driveAccountEmail) emails.add(item.driveAccountEmail);
    }
    return Array.from(emails);
  }, [driveLinks]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setSyncMessage(null);

    try {
      const connectedAccounts = getKnownAndConnectedDriveAccounts().filter((a) => a.connected);
      let totalRemoved = 0;
      let totalUpdated = 0;

      for (const acc of connectedAccounts) {
        const res = await syncLinkedItemsWithDrive(acc.email);
        totalRemoved += res.removedCount;
        totalUpdated += res.updatedCount;
      }

      setDriveLinks(getLinkedDriveItems());

      if (totalRemoved > 0) {
        setSyncMessage(
          `Synced with Google Drive: removed ${totalRemoved} item(s) deleted from Drive.`
        );
      } else if (totalUpdated > 0) {
        setSyncMessage(`Synced ${totalUpdated} linked item(s) with Google Drive.`);
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;
    setIsDeleting(true);

    try {
      if (fileToDelete.source === 'google-drive') {
        removeLinkedDriveItem(fileToDelete.id);
        setDriveLinks(getLinkedDriveItems());
        setFileToDelete(null);
      } else {
        if (fileToDelete.storagePath) {
          try {
            await deleteFileFromStorage(fileToDelete.storagePath);
          } catch (storageErr) {
            console.warn('Storage deletion notice:', storageErr);
          }
        }
        await deleteUploadedFileMetadata(fileToDelete.id);
        setFirebaseFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
        setFileToDelete(null);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter and Sort logic
  const filteredAndSortedFiles = useMemo(() => {
    let result = [...files];

    if (selectedAccountFilter !== 'all') {
      if (selectedAccountFilter === 'firebase') {
        result = result.filter((f) => f.source !== 'google-drive');
      } else {
        result = result.filter(
          (f) =>
            f.driveAccountEmail?.toLowerCase() === selectedAccountFilter.toLowerCase()
        );
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (f) =>
          f.fileName.toLowerCase().includes(q) ||
          (f.driveAccountEmail || '').toLowerCase().includes(q) ||
          getFileExtension(f.fileName).toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'all') {
      result = result.filter((f) => {
        const cat = f.isFolder
          ? 'folder'
          : getFileCategory(f.fileName, f.fileType);
        return cat === selectedCategory;
      });
    }

    result.sort((a, b) => {
      const timeA = a.uploadedAt?.seconds
        ? a.uploadedAt.seconds * 1000
        : a.uploadedAt
        ? new Date(a.uploadedAt).getTime()
        : 0;
      const timeB = b.uploadedAt?.seconds
        ? b.uploadedAt.seconds * 1000
        : b.uploadedAt
        ? new Date(b.uploadedAt).getTime()
        : 0;

      switch (sortBy) {
        case 'newest':
          return timeB - timeA;
        case 'oldest':
          return timeA - timeB;
        case 'largest':
          return (b.fileSize || 0) - (a.fileSize || 0);
        case 'smallest':
          return (a.fileSize || 0) - (b.fileSize || 0);
        case 'name':
          return a.fileName.localeCompare(b.fileName);
        default:
          return timeB - timeA;
      }
    });

    return result;
  }, [files, searchQuery, selectedCategory, selectedAccountFilter, sortBy]);

  const totalStorage = useMemo(() => {
    return files.reduce((acc, f) => acc + (f.fileSize || 0), 0);
  }, [files]);

  const categories = [
    { id: 'all', label: 'All Items' },
    { id: 'folder', label: 'Folders' },
    { id: 'document', label: 'Documents' },
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
    { id: 'code', label: 'Code & Data' },
    { id: 'hardware', label: 'Hardware/CAD' },
    { id: 'archive', label: 'Archives' },
    { id: 'audio', label: 'Audio' },
  ];

  const isTargetDriveLink = fileToDelete?.source === 'google-drive';

  return (
    <div className="w-full space-y-6">
      {/* Section Header */}
      {(files.length > 0 || !readOnly) && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide">
                {readOnly ? 'SHARED FILES & FOLDERS' : 'MY FILES & GOOGLE DRIVE LINKS'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold">
                {files.length} {files.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            {!readOnly && (
              <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2 font-mono">
                <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  Total Indexed Size:{' '}
                  <span className="text-slate-200 font-semibold">{formatFileSize(totalStorage)}</span>
                </span>
                {driveAccountsInLinks.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-cyan-300">
                      {driveAccountsInLinks.length} connected Google{' '}
                      {driveAccountsInLinks.length === 1 ? 'Drive' : 'Drives'}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          {/* View mode toggle & sync refresh */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            {!readOnly && (
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                title="Sync linked items with connected Google Drives"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
                <span className="hidden sm:inline">Sync Drive</span>
              </button>
            )}

            <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Sync Result Toast */}
      {syncMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Multi-Drive Account Filter Tabs (only shown when multiple Google Drives are linked) */}
      {driveAccountsInLinks.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider shrink-0">
            Drive Account:
          </span>
          <button
            type="button"
            onClick={() => setSelectedAccountFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono border whitespace-nowrap cursor-pointer transition ${
              selectedAccountFilter === 'all'
                ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200 font-bold'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Drives & Uploads
          </button>
          {driveAccountsInLinks.map((email) => (
            <button
              key={email}
              type="button"
              onClick={() => setSelectedAccountFilter(email)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono border whitespace-nowrap cursor-pointer transition flex items-center gap-1.5 ${
                selectedAccountFilter.toLowerCase() === email.toLowerCase()
                  ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200 font-bold'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <HardDrive className="w-3 h-3 text-cyan-400" />
              <span>{email}</span>
            </button>
          ))}
        </div>
      )}

      {/* Search, Sort & Category Controls (shown when items exist or in Admin mode) */}
      {(files.length > 0 || !readOnly) && (
        <>
          {/* Search and Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            <div className="md:col-span-7 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files, folders, or extensions..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-800 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="md:col-span-5 relative">
              <ArrowUpDown className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900/90 border border-slate-800 focus:border-cyan-400 rounded-xl text-white text-xs sm:text-sm appearance-none focus:outline-none cursor-pointer"
              >
                <option value="newest">Sort by: Newest First</option>
                <option value="oldest">Sort by: Oldest First</option>
                <option value="largest">Sort by: Largest Size</option>
                <option value="smallest">Sort by: Smallest Size</option>
                <option value="name">Sort by: Name (A - Z)</option>
              </select>
            </div>
          </div>

          {/* Category Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition cursor-pointer border ${
                  selectedCategory === cat.id
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-semibold'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Loading State */}
      {loading && files.length === 0 && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <span className="text-xs font-mono">Loading files & Google Drive links...</span>
        </div>
      )}

      {/* Empty State: No Files or Drive Links */}
      {!loading && files.length === 0 && !readOnly && (
        <div className="py-16 px-6 bg-slate-900/40 border border-slate-800 rounded-3xl text-center flex flex-col items-center justify-center">
          <div className="w-20 h-20 rounded-3xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mb-4 text-cyan-400">
            <FolderOpen className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No files or Drive links yet</h3>
          <p className="text-sm text-slate-400 max-w-md leading-relaxed">
            Use <strong>Connect it to your Google Drive</strong> in the top corner to select files or folders from your Google Drive accounts and display them here with thumbnails.
          </p>
        </div>
      )}

      {/* Empty Search Results */}
      {files.length > 0 && filteredAndSortedFiles.length === 0 && (
        <div className="py-12 px-6 bg-slate-900/40 border border-slate-800 rounded-2xl text-center flex flex-col items-center justify-center">
          <Filter className="w-8 h-8 text-slate-500 mb-2" />
          <p className="text-sm font-semibold text-white">No items match your filters</p>
          <p className="text-xs text-slate-400 mt-1">
            Try clearing your search query, category, or Drive account filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setSelectedAccountFilter('all');
            }}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-200 cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Grid View */}
      {filteredAndSortedFiles.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAndSortedFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onOpen={onOpenFile}
              onDelete={readOnly ? undefined : (target) => setFileToDelete(target)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {/* Table View */}
      {filteredAndSortedFiles.length > 0 && viewMode === 'table' && (
        <div className="w-full overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">File / Folder</th>
                <th className="py-3.5 px-4 font-semibold hidden sm:table-cell">Source</th>
                <th className="py-3.5 px-4 font-semibold">Type</th>
                <th className="py-3.5 px-4 font-semibold">Size</th>
                <th className="py-3.5 px-4 font-semibold hidden md:table-cell">Modified</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAndSortedFiles.map((file) => {
                const isDrive = file.source === 'google-drive';
                const isFolder = Boolean(file.isFolder);
                const ext = isFolder
                  ? 'FOLDER'
                  : getFileExtension(file.fileName) || (isDrive ? 'DRIVE' : 'FILE');

                return (
                  <tr
                    key={file.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <DriveThumbnail
                          fileName={file.fileName}
                          mimeType={file.fileType}
                          isFolder={isFolder}
                          thumbnailLink={file.thumbnailLink}
                          downloadURL={file.downloadURL}
                          driveFileId={file.driveFileId}
                          driveAccountEmail={file.driveAccountEmail}
                          size="sm"
                          onClick={() => onOpenFile(file)}
                        />
                        <span
                          onClick={() => onOpenFile(file)}
                          className="font-bold text-white group-hover:text-cyan-300 transition-colors cursor-pointer truncate max-w-xs block"
                          title={file.fileName}
                        >
                          {file.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell text-slate-300">
                      {isDrive ? file.driveAccountEmail : 'Firebase Storage'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] font-bold">
                        {ext}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-medium">
                      {isFolder ? '—' : file.fileSize > 0 ? formatFileSize(file.fileSize) : 'Drive'}
                    </td>
                    <td className="py-3 px-4 text-slate-400 hidden md:table-cell">
                      {formatDate(file.uploadedAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenFile(file)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white transition cursor-pointer"
                          title={isFolder ? 'Browse folder' : 'Open preview'}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        {!isFolder && (
                          <button
                            type="button"
                            onClick={() =>
                              isDrive
                                ? triggerDriveFileDownload(file)
                                : triggerFileDownload(file.downloadURL, file.fileName)
                            }
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-white transition cursor-pointer"
                            title="Download file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => setFileToDelete(file)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition cursor-pointer"
                            title={isDrive ? 'Remove link from webpage' : 'Delete file'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Dialog for File Deletion / Unlinking */}
      <ConfirmDialog
        isOpen={Boolean(fileToDelete)}
        title={isTargetDriveLink ? 'Remove Google Drive Link?' : 'Delete Uploaded File?'}
        message={
          isTargetDriveLink
            ? 'This removes the linked file or folder from this webpage. Your original item in Google Drive stays safe and untouched.'
            : 'This action will permanently delete the file from Firebase Cloud Storage and remove all metadata from Firestore. This cannot be undone.'
        }
        fileName={fileToDelete?.fileName}
        confirmText={isTargetDriveLink ? 'Remove Link' : 'Yes, Delete Permanently'}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setFileToDelete(null)}
      />
    </div>
  );
};
