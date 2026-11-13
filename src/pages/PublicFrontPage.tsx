import React, { useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { FileList } from '../components/FileList';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { UploadedFileRecord } from '../types';

interface PublicFrontPageProps {
  onOpenAdmin: () => void;
  isAdminLoggedIn?: boolean;
}

export const PublicFrontPage: React.FC<PublicFrontPageProps> = ({
  onOpenAdmin,
  isAdminLoggedIn = false,
}) => {
  const [previewFile, setPreviewFile] = useState<UploadedFileRecord | null>(null);

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col">
      {/* Top Bar with small square box labeled "Admin" in the top-right corner */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/70 bg-slate-950/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          {/* Brand Emblem */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 p-0.5 shadow-lg shadow-cyan-500/20 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <span className="font-extrabold tracking-wider text-sm sm:text-base bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent truncate">
              Create Inventor Lab
            </span>
          </div>

          {/* Top-Right Small Square Box: Admin */}
          <button
            type="button"
            id="admin-login-box-btn"
            onClick={onOpenAdmin}
            aria-label="Open Admin Login"
            className="w-14 h-14 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 hover:border-cyan-400 flex flex-col items-center justify-center gap-1 shadow-lg shadow-cyan-500/10 transition cursor-pointer shrink-0 group"
          >
            <ShieldCheck
              className={`w-4 h-4 transition ${
                isAdminLoggedIn
                  ? 'text-emerald-400 group-hover:text-emerald-300'
                  : 'text-cyan-400 group-hover:text-cyan-300'
              }`}
            />
            <span className="text-[11px] font-bold tracking-wide text-slate-100">
              Admin
            </span>
          </button>
        </div>
      </header>

      {/* Main Clean Front Page */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">
        {/* Title Page Header */}
        <div className="space-y-1.5">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Create Inventor Lab
          </h1>
          <p className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Project files
          </p>
        </div>

        {/* Selected Files and Folders List */}
        <section aria-label="Project Files">
          <FileList
            readOnly={true}
            onOpenFile={(file) => setPreviewFile(file)}
          />
        </section>
      </main>

      {/* File & Folder Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        readOnly={true}
      />
    </div>
  );
};
