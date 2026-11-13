import React, { useEffect, useState } from 'react';
import { Navbar } from '../components/Navbar';
import { FileUpload } from '../components/FileUpload';
import { FileList } from '../components/FileList';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { GoogleDriveConnectModal } from '../components/GoogleDriveConnectModal';
import { UploadedFileRecord } from '../types';
import {
  CloudSyncState,
  connectGoogleDriveAccount,
  getKnownAndConnectedDriveAccounts,
  subscribeToCloudSyncState,
  syncAllLinkedItemsToCloud,
  syncLinkedItemsWithDrive,
} from '../firebase/googleDrive';
import { getActiveFirebaseConfig } from '../firebase/configManager';
import { checkCloudProjectLinksHealth } from '../firebase/firestore';
import {
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

const PUBLIC_PROJECT_LINKS_RULES = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isAuthorizedAdmin() {
      return request.auth != null &&
        request.auth.token.email == '20sgamingrohit@gmail.com' &&
        request.auth.token.email_verified == true;
    }

    match /uploadedFiles/{fileId} {
      allow read, list, create, update, delete: if isAuthorizedAdmin();
    }

    match /projectLinks/{linkId} {
      allow read, list: if true;
      allow create, update, delete: if isAuthorizedAdmin();
    }
  }
}`;

interface DashboardPageProps {
  onViewFrontPage?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onViewFrontPage }) => {
  const [previewFile, setPreviewFile] = useState<UploadedFileRecord | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [driveModalAccount, setDriveModalAccount] = useState<string | null>(null);
  const [topDriveError, setTopDriveError] = useState<string | null>(null);

  const [cloudSync, setCloudSync] = useState<CloudSyncState>({
    status: 'idle',
    totalCount: 0,
    syncedCount: 0,
  });
  const [cloudHealth, setCloudHealth] = useState<{
    checked: boolean;
    ok: boolean;
    count: number;
    errorCode?: string;
    errorMessage?: string;
  }>({ checked: false, ok: true, count: 0 });
  const [copiedRules, setCopiedRules] = useState(false);

  const activeProjectId = getActiveFirebaseConfig().projectId;

  const runCloudSyncAndHealth = async () => {
    const [health, syncRes] = await Promise.all([
      checkCloudProjectLinksHealth(),
      syncAllLinkedItemsToCloud(),
    ]);
    setCloudHealth({
      checked: true,
      ok: health.ok,
      count: health.count,
      errorCode: health.errorCode,
      errorMessage: health.errorMessage,
    });
    return { health, syncRes };
  };

  useEffect(() => {
    const unsub = subscribeToCloudSyncState(setCloudSync);
    runCloudSyncAndHealth().catch(() => {});
    return unsub;
  }, [refreshTrigger]);

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_PROJECT_LINKS_RULES);
      setCopiedRules(true);
      setTimeout(() => setCopiedRules(false), 2500);
    } catch {
      // Fallback ignored
    }
  };

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

  const hasCloudPermissionError =
    cloudSync.status === 'error' || (cloudHealth.checked && !cloudHealth.ok);
  const cloudErrorReason =
    cloudSync.errorCode ||
    cloudSync.errorMessage ||
    cloudHealth.errorCode ||
    cloudHealth.errorMessage ||
    'permission-denied';

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col">
      {/* Top Navbar with single "Connect it to your Google Drive" button in top corner */}
      <Navbar
        onOpenDriveConnect={handleNavbarDriveConnect}
        onViewFrontPage={onViewFrontPage}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        {topDriveError && !driveModalOpen && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{topDriveError}</span>
          </div>
        )}

        {/* Cross-Device Publishing Status Banner (Admin Only) */}
        {hasCloudPermissionError && (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/35 text-amber-100 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs sm:text-sm">
                <p className="font-bold text-white">
                  Action Required to Show Selected Files on All Phones &amp; Browsers
                </p>
                <p className="text-amber-200/90 leading-relaxed">
                  Cloud database sync on Firebase project{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-950/60 font-mono text-amber-300">
                    {activeProjectId}
                  </code>{' '}
                  is blocked ({cloudErrorReason}). Until Firestore Rules allow{' '}
                  <code className="font-mono">projectLinks</code> public read + admin write,
                  other mobile phones will show blank below <em>Project files</em>.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-8">
              <button
                type="button"
                onClick={handleCopyRules}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 text-xs font-semibold cursor-pointer transition"
              >
                {copiedRules ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Rules Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Copy Firestore Rules</span>
                  </>
                )}
              </button>
              <a
                href={`https://console.firebase.google.com/project/${activeProjectId}/firestore/rules`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition"
              >
                <span>Open Firebase Rules</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => runCloudSyncAndHealth()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 text-xs font-semibold cursor-pointer transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Sync to All Phones</span>
              </button>
            </div>
          </div>
        )}

        {!hasCloudPermissionError && cloudHealth.checked && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Cloud Database Active ({activeProjectId}):{' '}
                <strong>{Math.max(cloudHealth.count, cloudSync.syncedCount)}</strong> item
                {Math.max(cloudHealth.count, cloudSync.syncedCount) === 1 ? '' : 's'} published to{' '}
                <strong>Project files</strong> (visible on all phones &amp; browsers).
              </span>
            </div>
            <button
              type="button"
              onClick={() => runCloudSyncAndHealth()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 hover:text-white cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Re-sync</span>
            </button>
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
