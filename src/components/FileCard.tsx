import React from 'react';
import {
  ExternalLink,
  Download,
  Trash2,
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
import {
  formatFileSize,
  formatDate,
  getFileCategory,
  getFileExtension,
  triggerFileDownload,
} from '../utils/fileHelpers';

interface FileCardProps {
  file: UploadedFileRecord;
  onOpen: (file: UploadedFileRecord) => void;
  onDelete: (file: UploadedFileRecord) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ file, onOpen, onDelete }) => {
  const ext = getFileExtension(file.fileName);
  const category = getFileCategory(file.fileName, file.fileType);

  const getBadgeStyle = () => {
    switch (category) {
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

  const renderIcon = () => {
    switch (category) {
      case 'image':
        return <ImageIcon className="w-6 h-6 text-emerald-400" />;
      case 'video':
        return <Video className="w-6 h-6 text-indigo-400" />;
      case 'audio':
        return <Music className="w-6 h-6 text-pink-400" />;
      case 'code':
        return <FileCode className="w-6 h-6 text-cyan-400" />;
      case 'hardware':
        return <Cpu className="w-6 h-6 text-amber-400" />;
      case 'archive':
        return <FileArchive className="w-6 h-6 text-violet-400" />;
      case 'document':
        return <FileText className="w-6 h-6 text-blue-400" />;
      default:
        return <FileGeneric className="w-6 h-6 text-slate-400" />;
    }
  };

  return (
    <div className="group relative bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 transition-all duration-200 hover:shadow-xl hover:shadow-cyan-950/20 flex flex-col justify-between">
      {/* Top row: Thumbnail or Icon + Extension Tag */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          {category === 'image' && file.downloadURL ? (
            <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 relative group/img cursor-pointer" onClick={() => onOpen(file)}>
              <img
                src={file.downloadURL}
                alt={file.fileName}
                className="w-full h-full object-cover group-hover/img:scale-110 transition duration-300"
                loading="lazy"
              />
            </div>
          ) : (
            <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${getBadgeStyle()}`}>
              {renderIcon()}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider border ${getBadgeStyle()}`}>
              {ext || 'FILE'}
            </span>
          </div>
        </div>

        {/* File Name */}
        <h4
          onClick={() => onOpen(file)}
          className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-2 mb-2 font-mono break-all cursor-pointer"
          title={file.fileName}
        >
          {file.fileName}
        </h4>

        {/* Size and Date */}
        <div className="flex items-center justify-between text-xs text-slate-400 mb-4 font-mono">
          <span>{formatFileSize(file.fileSize)}</span>
          <span className="text-slate-400 text-[11px]">{formatDate(file.uploadedAt)}</span>
        </div>
      </div>

      {/* Action Buttons: OPEN, DOWNLOAD, DELETE */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpen(file)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            title="Open file preview"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span>OPEN</span>
          </button>

          <button
            type="button"
            onClick={() => triggerFileDownload(file.downloadURL, file.fileName)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            title="Download original file"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>DOWNLOAD</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onDelete(file)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
          title="Delete file permanently"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
