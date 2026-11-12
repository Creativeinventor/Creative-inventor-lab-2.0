import React from 'react';
import {
  Sparkles,
  LogOut,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  onOpenPasswordModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenPasswordModal }) => {
  const { user, logout, isDemo } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 p-0.5 shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider text-base sm:text-lg bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                CREATIVE INVENTOR LAB
              </span>
              {isDemo ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  DEMO MODE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-widest uppercase bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  <ShieldCheck className="w-3 h-3" />
                  Admin
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-mono hidden md:block">
              {isDemo ? 'Cloud Storage (Unconfigured - Demo Mode)' : 'Cloud Storage & Asset Portal'}
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Change Password */}
          <button
            onClick={onOpenPasswordModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Change administrator password"
          >
            <KeyRound className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Change Password</span>
          </button>

          {/* User identifier tag */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono">
            <div className={`w-2 h-2 rounded-full ${isDemo ? 'bg-amber-400' : 'bg-cyan-400'} animate-ping`} />
            <span>{user?.email?.split('@')[0] || 'admin'}</span>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>LOGOUT</span>
          </button>
        </div>
      </div>
    </header>
  );
};
