import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { FileUpload } from '../components/FileUpload';
import { FileList } from '../components/FileList';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { UploadedFileRecord } from '../types';
import { Sparkles, AlertTriangle, Terminal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const DashboardPage: React.FC = () => {
  const { isDemo } = useAuth();
  const [previewFile, setPreviewFile] = useState<UploadedFileRecord | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <Navbar onOpenPasswordModal={() => setIsPasswordModalOpen(true)} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10">
        {/* Developer Notification for Demo Mode */}
        {isDemo && (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="text-xs sm:text-sm">
                <p className="font-bold text-amber-300 flex items-center gap-2">
                  <span>DEMONSTRATION MODE ACTIVE</span>
                  <span className="text-[10px] font-mono font-normal uppercase bg-amber-400/20 px-2 py-0.5 rounded text-amber-200">
                    Firebase Unconfigured
                  </span>
                </p>
                <p className="text-slate-300 mt-1 leading-relaxed">
                  You are viewing the dashboard in demonstration mode. To enable real file storage in Firebase Cloud Storage and persistent indexing in Cloud Firestore, add your project credentials to <code className="text-cyan-300 font-mono">.env.local</code> or Vercel Environment Variables.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 border border-amber-500/30 rounded-xl text-xs font-mono text-amber-300/90 shrink-0">
              <Terminal className="w-3.5 h-3.5" />
              <span>Project: creative-inventor-lab</span>
            </div>
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
          <span>{isDemo ? 'Running in Demo Mode' : 'Connected to Firebase Cloud Storage & Firestore'}</span>
        </div>
      </footer>

      {/* Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
};
