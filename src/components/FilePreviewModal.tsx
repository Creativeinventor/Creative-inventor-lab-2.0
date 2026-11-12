import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { UploadedFileRecord } from '../types';
import {
  formatFileSize,
  formatDate,
  getFileCategory,
  getFileExtension,
  triggerFileDownload,
} from '../utils/fileHelpers';

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

  useEffect(() => {
    if (!file || !isOpen) {
      setTextContent(null);
      setTextError(null);
      return;
    }

    const category = getFileCategory(file.fileName, file.fileType);
    const ext = getFileExtension(file.fileName).toLowerCase();

    // If text or code file, fetch preview content safely
    if (
      category === 'code' ||
      ['txt', 'json', 'md', 'csv', 'xml', 'log', 'env'].includes(ext)
    ) {
      setLoadingText(true);
      setTextError(null);
      fetch(file.downloadURL)
        .then((res) => {
          if (!res.ok) throw new Error('Could not read file contents');
          return res.text();
        })
        .then((text) => {
          // Limit preview to first 100KB to prevent browser freezing on massive files
          if (text.length > 100000) {
            setTextContent(text.slice(0, 100000) + '\n\n... [Content truncated for preview performance]');
          } else {
            setTextContent(text);
          }
        })
        .catch((err) => {
          console.warn('Failed to load text preview:', err);
          setTextError('Preview unavailable directly (CORS or network policy). Click Open in New Tab below.');
        })
        .finally(() => {
          setLoadingText(false);
        });
    }
  }, [file, isOpen]);

  if (!isOpen || !file) return null;

  const category = getFileCategory(file.fileName, file.fileType);
  const ext = getFileExtension(file.fileName);

  const handleCopyText = () => {
    if (textContent) {
      navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="p-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate font-mono">
                {file.fileName}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded text-cyan-300 font-mono font-bold">
                  {ext || 'FILE'}
                </span>
                <span>•</span>
                <span>{formatFileSize(file.fileSize)}</span>
                <span>•</span>
                <span>Uploaded {formatDate(file.uploadedAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={file.downloadURL}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Open raw file in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={() => triggerFileDownload(file.downloadURL, file.fileName)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition cursor-pointer"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-950/40 flex items-center justify-center min-h-[300px]">
          {category === 'image' && (
            <div className="flex flex-col items-center justify-center max-h-full">
              <img
                src={file.downloadURL}
                alt={file.fileName}
                className="max-h-[65vh] max-w-full rounded-xl object-contain shadow-xl border border-slate-800"
              />
            </div>
          )}

          {category === 'video' && (
            <div className="w-full flex justify-center">
              <video
                controls
                autoPlay
                className="max-h-[65vh] max-w-full rounded-xl shadow-xl bg-black border border-slate-800"
              >
                <source src={file.downloadURL} type={file.fileType} />
                Your browser does not support the video tag.
              </video>
            </div>
          )}

          {category === 'audio' && (
            <div className="w-full max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center text-center shadow-xl">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center mb-6 animate-pulse">
                <FileCode className="w-10 h-10 text-cyan-400" />
              </div>
              <h4 className="text-white font-medium mb-1 truncate max-w-xs">{file.fileName}</h4>
              <p className="text-xs text-slate-400 mb-6 font-mono">{formatFileSize(file.fileSize)}</p>
              <audio controls className="w-full">
                <source src={file.downloadURL} type={file.fileType} />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {ext.toLowerCase() === 'pdf' && (
            <div className="w-full h-[65vh] flex flex-col">
              <object
                data={file.downloadURL}
                type="application/pdf"
                className="w-full h-full rounded-xl border border-slate-800"
              >
                <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-slate-900 rounded-xl">
                  <FileText className="w-16 h-16 text-cyan-400 mb-4" />
                  <p className="text-white font-medium mb-2">PDF Document Ready</p>
                  <p className="text-sm text-slate-400 mb-4">Direct embedded preview not supported in this frame.</p>
                  <a
                    href={file.downloadURL}
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

          {(category === 'code' || ['txt', 'json', 'md', 'csv', 'xml', 'log', 'env'].includes(ext.toLowerCase())) && (
            <div className="w-full h-full max-h-[65vh] flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs">
                <span className="text-slate-400 font-mono">Document Content ({ext})</span>
                {textContent && (
                  <button
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

          {category !== 'image' &&
            category !== 'video' &&
            category !== 'audio' &&
            ext.toLowerCase() !== 'pdf' &&
            category !== 'code' &&
            !['txt', 'json', 'md', 'csv', 'xml', 'log', 'env'].includes(ext.toLowerCase()) && (
              <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-900 border border-slate-800 rounded-2xl max-w-md">
                <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                  <FileText className="w-10 h-10" />
                </div>
                <h4 className="text-lg font-bold text-white mb-1 font-mono">{file.fileName}</h4>
                <p className="text-sm text-slate-400 mb-6">
                  {ext} file • {formatFileSize(file.fileSize)}
                </p>
                <div className="flex items-center gap-3">
                  <a
                    href={file.downloadURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-sm flex items-center gap-2 transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in Browser
                  </a>
                  <button
                    onClick={() => triggerFileDownload(file.downloadURL, file.fileName)}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Download File
                  </button>
                </div>
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono truncate">Storage: {file.storagePath}</span>
          <button
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
