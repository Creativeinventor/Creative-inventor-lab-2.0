import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { FileUpload } from '../components/FileUpload';
import { FileList } from '../components/FileList';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { GoogleDriveConnectModal } from '../components/GoogleDriveConnectModal';
import { UploadedFileRecord } from '../types';
import {
  connectGoogleDriveAccount,
  getKnownAndConnectedDriveAccounts,
  syncLinkedItemsWithDrive,
} from '../firebase/googleDrive';
import { Sparkles, AlertCircle } from 'lucide-react';

interface DashboardPageProps {
  onViewFrontPage?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onViewFrontPage }) => {
  const [previewFile, setPreviewFile] = useState<UploadedFileRecord | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [driveModalAccount, setDriveModalAccount] = useState<string | null>(null);
  const [topDriveError, setTopDriveError] = useState<string | null>(null);

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  /**
   * Single entry point from the top-right "Connect it to your Google Drive" button:
   * - If no Drive account is active in this session yet, opens Google's device account picker directly.
   * - Once chosen (or if a Drive is already connected), opens the Drive browser modal.
   */
  const handleNavbarDriveConnect = async () => {
    setTopDriveError(null);
    const activeAccounts = getKnownAndConnectedDriveAccounts().filter((a) => a.connected);

    if (activeAccounts.length > 0) {
      setDriveModalAccount(activeAccounts[0].email);
      setDriveModalOpen(true);
      return;
    }

    try {
      const account = await connectGoogleDriveAccount();
      setDriveModalAccount(account.email);
      setDriveModalOpen(true);
      syncLinkedItemsWithDrive(account.email).catch(() => {});
    } catch (err: any) {
      setTopDriveError(err?.message || 'Could not open Google Drive account selector.');
      setDriveModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col">
      {/* Top Navbar with single "Connect it to your Google Drive" button in top corner */}
      <Navbar
        onOpenDriveConnect={handleNavbarDriveConnect}
        onViewFrontPage={onViewFrontPage}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
        {topDriveError && !driveModalOpen && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{topDriveError}</span>
          </div>
        )}

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
            Upload your files or connect your Google Drive from the top corner to display files and folders permanently with thumbnails.
          </p>
        </div>

        {/* Direct File Upload Card Section */}
        <section aria-label="Upload Section">
          <FileUpload
            onUploadSuccess={handleUploadSuccess}
            onPreviewFile={(file) => setPreviewFile(file)}
          />
        </section>

        {/* Uploaded & Google Drive Linked Files Management Section */}
        <section aria-label="Uploaded Files Section" className="pt-2">
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
          <span>Multi-Account Google Drive & Firebase Portal</span>
        </div>
      </footer>

      {/* Multi-Account Google Drive Picker & Browser Modal */}
      <GoogleDriveConnectModal
        isOpen={driveModalOpen}
        initialAccountEmail={driveModalAccount}
        onClose={() => setDriveModalOpen(false)}
        onItemsLinked={() => setRefreshTrigger((prev) => prev + 1)}
      />

      {/* Preview / Folder Explorer Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
};
