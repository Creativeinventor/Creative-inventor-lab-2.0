import React, { useEffect, useState } from 'react';
import { Navbar } from '../components/Navbar';
import { FileUpload } from '../components/FileUpload';
import { FileList } from '../components/FileList';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { GoogleDriveConnectModal } from '../components/GoogleDriveConnectModal';
import { DriveAccountInfo, UploadedFileRecord } from '../types';
import {
  connectGoogleDriveAccount,
  getKnownAndConnectedDriveAccounts,
  subscribeToDriveState,
  syncLinkedItemsWithDrive,
} from '../firebase/googleDrive';
import {
  Sparkles,
  HardDrive,
  UploadCloud,
  Plus,
  FolderOpen,
  AlertCircle,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [previewFile, setPreviewFile] = useState<UploadedFileRecord | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [driveModalAccount, setDriveModalAccount] = useState<string | null>(null);
  const [driveAccounts, setDriveAccounts] = useState<DriveAccountInfo[]>(() =>
    getKnownAndConnectedDriveAccounts()
  );
  const [connectingTopDrive, setConnectingTopDrive] = useState(false);
  const [topDriveError, setTopDriveError] = useState<string | null>(null);
  const [activeActionTab, setActiveActionTab] = useState<'drive' | 'firebase'>('drive');

  useEffect(() => {
    const refreshAccounts = () => {
      setDriveAccounts(getKnownAndConnectedDriveAccounts());
    };
    refreshAccounts();
    return subscribeToDriveState(refreshAccounts);
  }, []);

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  /**
   * Clicking "Connect it to your Google Drive" in the top-right corner:
   * - If no Drive is active yet in this session, opens the Google device account picker immediately.
   * - Once an account is chosen, opens the Drive browser modal with that account's files & folders.
   * - If a Drive is already connected, opens the Drive browser modal to browse or add more Drives.
   */
  const handleNavbarDriveConnect = async () => {
    setTopDriveError(null);
    const activeAccounts = getKnownAndConnectedDriveAccounts().filter((a) => a.connected);

    if (activeAccounts.length > 0) {
      setDriveModalAccount(activeAccounts[0].email);
      setDriveModalOpen(true);
      return;
    }

    setConnectingTopDrive(true);
    try {
      const account = await connectGoogleDriveAccount();
      setDriveModalAccount(account.email);
      setDriveModalOpen(true);
      syncLinkedItemsWithDrive(account.email).catch(() => {});
    } catch (err: any) {
      setTopDriveError(err?.message || 'Could not open Google Drive account selector.');
      // Still open the modal so the user can retry or pick a known Drive account
      setDriveModalOpen(true);
    } finally {
      setConnectingTopDrive(false);
    }
  };

  const handleConnectNewDriveDirectly = async () => {
    setTopDriveError(null);
    setConnectingTopDrive(true);
    try {
      const account = await connectGoogleDriveAccount();
      setDriveModalAccount(account.email);
      setDriveModalOpen(true);
      syncLinkedItemsWithDrive(account.email).catch(() => {});
    } catch (err: any) {
      setTopDriveError(err?.message || 'Could not connect Google Drive account.');
    } finally {
      setConnectingTopDrive(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col">
      {/* Top Navbar with "Connect it to your Google Drive" in top corner */}
      <Navbar onOpenDriveConnect={handleNavbarDriveConnect} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
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
            CONNECT GOOGLE DRIVES & MANAGE YOUR ASSETS
          </h2>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed">
            Connect multiple Google Drive accounts to browse and pin files or folders permanently with thumbnails, or upload directly to Firebase Cloud Storage.
          </p>
        </div>

        {/* Mode Switcher Tabs: Google Drive Multi-Account Linker vs Direct Upload */}
        <section aria-label="Storage Mode Switcher" className="space-y-4">
          <div className="inline-flex p-1 rounded-2xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveActionTab('drive')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                activeActionTab === 'drive'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span>Google Drive Links ({driveAccounts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveActionTab('firebase')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                activeActionTab === 'firebase'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Direct Firebase Upload</span>
            </button>
          </div>

          {activeActionTab === 'drive' && (
            <div className="relative w-full rounded-3xl p-6 sm:p-8 border-2 border-slate-800 bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950/80 shadow-2xl overflow-hidden">
              <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <div className="flex items-center gap-2 text-cyan-300 text-xs font-mono font-bold uppercase tracking-wider">
                    <HardDrive className="w-4 h-4" />
                    <span>Multi-Account Google Drive Hub</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                    Link Files & Folders From Any Google Drive
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Choose a Google account on your device to browse its folders and files. Any linked file or folder stays displayed here permanently with its thumbnail unless you unlink it or delete it from Google Drive.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={handleConnectNewDriveDirectly}
                    disabled={connectingTopDrive}
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-xl shadow-cyan-500/20 flex items-center gap-2 cursor-pointer transition disabled:opacity-60"
                  >
                    {connectingTopDrive ? (
                      <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>
                      {driveAccounts.length === 0
                        ? 'Connect it to your Google Drive'
                        : 'Add Another Google Drive'}
                    </span>
                  </button>

                  {driveAccounts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDriveModalAccount(driveAccounts[0].email);
                        setDriveModalOpen(true);
                      }}
                      className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition"
                    >
                      <FolderOpen className="w-4 h-4 text-amber-400" />
                      <span>Browse Connected Drives</span>
                    </button>
                  )}
                </div>
              </div>

              {topDriveError && (
                <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{topDriveError}</span>
                </div>
              )}

              {/* Connected / Known Google Drives Strip */}
              {driveAccounts.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mr-1">
                    Linked Drives:
                  </span>
                  {driveAccounts.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => {
                        setDriveModalAccount(acc.email);
                        setDriveModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-slate-200 transition cursor-pointer"
                    >
                      {acc.photoURL ? (
                        <img
                          src={acc.photoURL}
                          alt={acc.displayName}
                          referrerPolicy="no-referrer"
                          className="w-4 h-4 rounded-full object-cover"
                        />
                      ) : (
                        <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                      )}
                      <span>{acc.email}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          acc.connected
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {acc.connected ? 'Live' : 'Tap to open'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeActionTab === 'firebase' && (
            <FileUpload
              onUploadSuccess={handleUploadSuccess}
              onPreviewFile={(file) => setPreviewFile(file)}
            />
          )}
        </section>

        {/* Uploaded & Google Drive Linked Files Management Section */}
        <section aria-label="Files & Drive Links Section" className="pt-2">
          <FileList
            onOpenFile={(file) => setPreviewFile(file)}
            onOpenDriveConnect={handleNavbarDriveConnect}
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
