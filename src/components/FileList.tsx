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
  FileCode,
  FileText,
  FileArchive,
  Image as ImageIcon,
  Video,
  Music,
  Cpu,
  File as FileGeneric,
} from 'lucide-react';
import { UploadedFileRecord } from '../types';
import { subscribeToUploadedFiles, deleteUploadedFileMetadata } from '../firebase/firestore';
import { deleteFileFromStorage } from '../firebase/storage';
import { FileCard } from './FileCard';
import { ConfirmDialog } from './ConfirmDialog';
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
}

export const FileList: React.FC<FileListProps> = ({ onOpenFile, refreshTrigger }) => {
  const [files, setFiles] = useState<UploadedFileRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'largest' | 'smallest' | 'name'>('newest');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Deletion state
  const [fileToDelete, setFileToDelete] = useState<UploadedFileRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Subscribe to real-time updates from Firestore
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToUploadedFiles(
      (updatedFiles) => {
        setFiles(updatedFiles);
        setLoading(false);
        setIsRefreshing(false);
      },
      (error) => {
        console.warn('Realtime subscription error in FileList:', error);
        setLoading(false);
        setIsRefreshing(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [refreshTrigger]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      // 1. Delete from Firebase Storage if storagePath exists
      if (fileToDelete.storagePath) {
        try {
          await deleteFileFromStorage(fileToDelete.storagePath);
        } catch (storageErr) {
          console.warn('Storage deletion notice:', storageErr);
        }
      }

      // 2. Delete metadata from Firestore
      await deleteUploadedFileMetadata(fileToDelete.id);

      // 3. Update local state
      setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
      setFileToDelete(null);
    } catch (err: any) {
      console.error('Delete failed:', err);
      setDeleteError(err?.message || 'Failed to delete file. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter and Sort logic
  const filteredAndSortedFiles = useMemo(() => {
    let result = [...files];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (f) =>
          f.fileName.toLowerCase().includes(q) ||
          getFileExtension(f.fileName).toLowerCase().includes(q)
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter((f) => getFileCategory(f.fileName, f.fileType) === selectedCategory);
    }

    // Sort
    result.sort((a, b) => {
      const timeA = a.uploadedAt?.seconds || (a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0);
      const timeB = b.uploadedAt?.seconds || (b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0);

      switch (sortBy) {
        case 'newest':
          return timeB - timeA;
        case 'oldest':
          return timeA - timeB;
        case 'largest':
          return b.fileSize - a.fileSize;
        case 'smallest':
          return a.fileSize - b.fileSize;
        case 'name':
          return a.fileName.localeCompare(b.fileName);
        default:
          return timeB - timeA;
      }
    });

    return result;
  }, [files, searchQuery, selectedCategory, sortBy]);

  const totalStorage = useMemo(() => {
    return files.reduce((acc, f) => acc + (f.fileSize || 0), 0);
  }, [files]);

  const categories = [
    { id: 'all', label: 'All Files' },
    { id: 'document', label: 'Documents' },
    { id: 'image', label: 'Images' },
    { id: 'code', label: 'Code & Data' },
    { id: 'hardware', label: 'Hardware/CAD' },
    { id: 'archive', label: 'Archives' },
    { id: 'video', label: 'Videos' },
    { id: 'audio', label: 'Audio' },
  ];

  const renderSmallIcon = (category: string) => {
    switch (category) {
      case 'image':
        return <ImageIcon className="w-4 h-4 text-emerald-400" />;
      case 'video':
        return <Video className="w-4 h-4 text-indigo-400" />;
      case 'audio':
        return <Music className="w-4 h-4 text-pink-400" />;
      case 'code':
        return <FileCode className="w-4 h-4 text-cyan-400" />;
      case 'hardware':
        return <Cpu className="w-4 h-4 text-amber-400" />;
      case 'archive':
        return <FileArchive className="w-4 h-4 text-violet-400" />;
      case 'document':
        return <FileText className="w-4 h-4 text-blue-400" />;
      default:
        return <FileGeneric className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide">
              MY UPLOADED FILES
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold">
              {files.length} {files.length === 1 ? 'file' : 'files'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 font-mono">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            Total Cloud Storage Used: <span className="text-slate-200 font-semibold">{formatFileSize(totalStorage)}</span>
          </p>
        </div>

        {/* View mode toggle & refresh */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

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

      {/* Search and Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        {/* Search */}
        <div className="md:col-span-7 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files by filename or extension..."
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

        {/* Sort Select */}
        <div className="md:col-span-5 relative">
          <ArrowUpDown className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full pl-10 pr-8 py-2.5 bg-slate-900/90 border border-slate-800 focus:border-cyan-400 rounded-xl text-white text-xs sm:text-sm appearance-none focus:outline-none cursor-pointer"
          >
            <option value="newest">Sort by: Newest Uploads</option>
            <option value="oldest">Sort by: Oldest Uploads</option>
            <option value="largest">Sort by: Largest Size</option>
            <option value="smallest">Sort by: Smallest Size</option>
            <option value="name">Sort by: Filename (A - Z)</option>
          </select>
        </div>
      </div>

      {/* Category Pills */}
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

      {/* Loading State */}
      {loading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <span className="text-xs font-mono">Syncing file records with Firebase...</span>
        </div>
      )}

      {/* Empty State: No Files at all */}
      {!loading && files.length === 0 && (
        <div className="py-16 px-6 bg-slate-900/40 border border-slate-800 rounded-3xl text-center flex flex-col items-center justify-center">
          <div className="w-20 h-20 rounded-3xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mb-4 text-cyan-400">
            <FolderOpen className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No files uploaded yet</h3>
          <p className="text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
            Start by uploading your first file! Upload documents, circuit designs, firmware, videos, or archives from your mobile or PC.
          </p>
        </div>
      )}

      {/* Empty Search Results */}
      {!loading && files.length > 0 && filteredAndSortedFiles.length === 0 && (
        <div className="py-12 px-6 bg-slate-900/40 border border-slate-800 rounded-2xl text-center flex flex-col items-center justify-center">
          <Filter className="w-8 h-8 text-slate-500 mb-2" />
          <p className="text-sm font-semibold text-white">No files match your search criteria</p>
          <p className="text-xs text-slate-400 mt-1">Try searching for a different keyword or category.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-200 cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Grid View */}
      {!loading && filteredAndSortedFiles.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAndSortedFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onOpen={onOpenFile}
              onDelete={(target) => setFileToDelete(target)}
            />
          ))}
        </div>
      )}

      {/* Table View */}
      {!loading && filteredAndSortedFiles.length > 0 && viewMode === 'table' && (
        <div className="w-full overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-semibold">File</th>
                <th className="py-3.5 px-4 font-semibold hidden sm:table-cell">Format</th>
                <th className="py-3.5 px-4 font-semibold">Size</th>
                <th className="py-3.5 px-4 font-semibold hidden md:table-cell">Uploaded Date</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAndSortedFiles.map((file) => {
                const category = getFileCategory(file.fileName, file.fileType);
                const ext = getFileExtension(file.fileName);

                return (
                  <tr
                    key={file.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg shrink-0">
                          {renderSmallIcon(category)}
                        </div>
                        <span
                          onClick={() => onOpenFile(file)}
                          className="font-bold text-white group-hover:text-cyan-300 transition-colors cursor-pointer truncate max-w-xs block"
                          title={file.fileName}
                        >
                          {file.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] font-bold">
                        {ext || 'FILE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-medium">
                      {formatFileSize(file.fileSize)}
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
                          title="Open preview"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerFileDownload(file.downloadURL, file.fileName)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-white transition cursor-pointer"
                          title="Download file"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFileToDelete(file)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition cursor-pointer"
                          title="Delete file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Dialog for File Deletion */}
      <ConfirmDialog
        isOpen={Boolean(fileToDelete)}
        title="Delete Uploaded File?"
        message="This action will permanently delete the file from Firebase Cloud Storage and remove all metadata from Firestore. This cannot be undone."
        fileName={fileToDelete?.fileName}
        confirmText="Yes, Delete Permanently"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setFileToDelete(null)}
      />
    </div>
  );
};
