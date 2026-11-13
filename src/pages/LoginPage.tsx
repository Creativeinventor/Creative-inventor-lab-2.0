import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertCircle,
  ShieldCheck,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
  onSuccess: () => void;
}

const GoogleLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { loginWithGoogle, authError, clearAuthError } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
  const isDomainError = Boolean(
    errorMessage && errorMessage.includes('not authorized in Firebase Authentication')
  );

  useEffect(() => {
    if (authError) {
      setErrorMessage(authError);
    }
  }, [authError]);

  const handleCopyDomain = async () => {
    if (!currentDomain) return;
    try {
      await navigator.clipboard.writeText(currentDomain);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setCopiedDomain(false);
    clearAuthError();
    setIsLoading(true);

    try {
      await loginWithGoogle();
      onSuccess();
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      setErrorMessage(
        err?.message || 'You are not authorised for this access.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#070a13] text-slate-100 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-cyan-600/15 via-blue-600/10 to-transparent blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 left-1/4 w-[600px] h-[400px] bg-purple-700/10 blur-[140px] pointer-events-none" />

      {/* Top Header Bar */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 p-0.5 shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <span className="font-extrabold tracking-wider text-base sm:text-lg text-white">
            CREATIVE INVENTOR LAB
          </span>
        </div>
      </header>

      {/* Centered Login Card */}
      <main className="w-full max-w-md mx-auto px-4 py-8 z-10">
        {/* Headings */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono font-bold uppercase tracking-widest mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            ADMINISTRATOR PORTAL
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
            CREATIVE INVENTOR LAB
          </h1>
          <p className="text-sm text-slate-400 mt-2 font-medium">
            Welcome to Creative Inventor Lab
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-7 sm:p-9 shadow-2xl glow-card relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600" />

          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl flex flex-col gap-2.5 text-xs sm:text-sm text-red-300 animate-in fade-in"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <div className="leading-relaxed font-medium break-words">{errorMessage}</div>
              </div>

              {isDomainError && currentDomain && (
                <div className="pt-2 border-t border-red-500/20 flex items-center justify-between gap-2">
                  <code className="text-[11px] font-mono text-red-200 bg-slate-950/70 px-2 py-1 rounded-lg truncate select-all">
                    {currentDomain}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyDomain}
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-100 text-[11px] font-semibold transition cursor-pointer"
                  >
                    {copiedDomain ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Domain</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shadow-inner">
                <GoogleLogo className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Google Account Verification
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sign in with your authorized administrator Google account to access Creative Inventor Lab.
              </p>
            </div>

            {/* Sign in with Google Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-900 font-bold text-sm sm:text-base shadow-xl shadow-cyan-500/10 border border-slate-200 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-900 rounded-full animate-spin" />
                  <span>SIGNING IN WITH GOOGLE...</span>
                </>
              ) : (
                <>
                  <GoogleLogo className="w-5 h-5 shrink-0" />
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-4 py-6 text-center text-xs text-slate-400 font-mono z-10">
        CREATIVE INVENTOR LAB • Cloud Storage & Asset Management Portal
      </footer>
    </div>
  );
};
