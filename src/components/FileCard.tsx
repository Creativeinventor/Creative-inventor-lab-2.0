import React from 'react';
import {
  ExternalLink,
  Download,
  Trash2,
  HardDrive,
  FolderOpen,
} from 'lucide-react';
import { UploadedFileRecord } from '../types';
import {
  formatFileSize,
  formatDate,
  getFileCategory,
  getFileExtension,
  triggerFileDownload,
} from '../utils/fileHelpers';
import { triggerDriveFileDownload } from '../firebase/googleDrive';
import { DriveThumbnail } from './DriveThumbnail';

interface FileCardProps {
  file: UploadedFileRecord;
  onOpen: (file: UploadedFileRecord) => void;
  onDelete: (file: UploadedFileRecord) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ file, onOpen, onDelete }) => {
  const isDrive = file.source === 'google-drive';
  const isFolder = Boolean(file.isFolder);
  const ext = isFolder
    ? 'FOLDER'
    : getFileExtension(file.fileName) || (isDrive ? 'DRIVE' : 'FILE');
  const category = isFolder ? 'folder' : getFileCategory(file.fileName, file.fileType);

  const getBadgeStyle = () => {
    switch (category) {
      case 'folder':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'image':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'video':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'audio':
        return 'bg-pink-500/10 text-pink-400 border-pink-500/30';
      case 'code':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'hardware':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'archive':
        return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
      case 'document':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const handleDownload = () => {
    if (isDrive) {
      triggerDriveFileDownload(file);
    } else {
      triggerFileDownload(file.downloadURL, file.fileName);
    }
  };

  return (
    <div className="group relative bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 transition-all duration-200 hover:shadow-xl hover:shadow-cyan-950/20 flex flex-col justify-between">
      <div>
        {/* Top row: Thumbnail + Extension/Folder Tag */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <DriveThumbnail
            fileName={file.fileName}
            mimeType={file.fileType}
            isFolder={isFolder}
            thumbnailLink={file.thumbnailLink}
            downloadURL={file.downloadURL}
            driveFileId={file.driveFileId}
            driveAccountEmail={file.driveAccountEmail}
            onClick={() => onOpen(file)}
          />

          <div className="flex flex-col items-end gap-1">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider border ${getBadgeStyle()}`}
            >
              {ext}
            </span>
          </div>
        </div>

        {/* File or Folder Name */}
        <h4
          onClick={() => onOpen(file)}
          className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-2 mb-1.5 font-mono break-all cursor-pointer"
          title={file.fileName}
        >
          {file.fileName}
        </h4>

        {/* Connected Google Drive Source Line */}
        {isDrive && file.driveAccountEmail && (
          <div className="flex items-center gap-1.5 text-[11px] text-cyan-300/90 font-mono mb-2 truncate">
            <HardDrive className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="truncate" title={file.driveAccountEmail}>
              {file.driveAccountEmail}
            </span>
          </div>
        )}

        {/* Size and Date */}
        <div className="flex items-center justify-between text-xs text-slate-400 mb-4 font-mono">
          <span>
            {isFolder
              ? 'Drive Folder'
              : file.fileSize > 0
              ? formatFileSize(file.fileSize)
              : 'Google Doc / Drive'}
          </span>
          <span className="text-slate-400 text-[11px]">{formatDate(file.uploadedAt)}</span>
        </div>
      </div>

      {/* Action Buttons: OPEN, DOWNLOAD/DRIVE, REMOVE */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpen(file)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            title={isFolder ? 'Browse folder contents' : 'Open file preview'}
          >
            {isFolder ? (
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>OPEN</span>
          </button>

          {!isFolder ? (
            <button
              type="button"
              onClick={handleDownload}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Download original file"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>DOWNLOAD</span>
            </button>
          ) : (
            file.webViewLink && (
              <a
                href={file.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 transition"
                title="Open folder in Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>DRIVE</span>
              </a>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => onDelete(file)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
          title={isDrive ? 'Remove link from webpage' : 'Delete file permanently'}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
