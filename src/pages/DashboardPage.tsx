import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { FileUpload } from '../components/FileUpload';
import { FileList } from '../components/FileList';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { AccountSettingsModal } from '../components/AccountSettingsModal';
import { UploadedFileRecord } from '../types';
import { Sparkles } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [previewFile, setPreviewFile] = useState<UploadedFileRecord | null>(null);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <Navbar onOpenAccountSettings={() => setIsAccountSettingsOpen(true)} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10">
        {/* Dashboard Hero Header */}
        <div className="text-center sm:text-left space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold tracking-wider uppercase mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            CREATIVE INVENTOR LAB CLOUD
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            WELCOME TO CREATIVE INVENTOR LAB
          </h1>
          <h2 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            UPLOAD YOUR DATA
          </h2>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed">
            Upload your files securely to Creative Inventor Lab Cloud Storage. Access your files anytime, from anywhere.
          </p>
        </div>

        {/* Upload Card Section */}
        <section aria-label="Upload Section">
          <FileUpload
            onUploadSuccess={handleUploadSuccess}
            onPreviewFile={(file) => setPreviewFile(file)}
          />
        </section>

        {/* Uploaded Files Management Section */}
        <section aria-label="Uploaded Files Section" className="pt-4">
          <FileList
            onOpenFile={(file) => setPreviewFile(file)}
            refreshTrigger={refreshTrigger}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-slate-950/60 py-6 text-center text-xs text-slate-400 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>CREATIVE INVENTOR LAB • Administrator Portal</span>
          <span>Connected to Firebase Cloud Storage & Firestore</span>
        </div>
      </footer>

      {/* Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
      />

      {/* Account Settings Modal (Change User ID & Change Password) */}
      <AccountSettingsModal
        isOpen={isAccountSettingsOpen}
        onClose={() => setIsAccountSettingsOpen(false)}
      />
    </div>
  );
};
