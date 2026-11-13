import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  LogOut,
  ShieldCheck,
  User as UserIcon,
  HardDrive,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getKnownAndConnectedDriveAccounts,
  subscribeToDriveState,
} from '../firebase/googleDrive';

interface NavbarProps {
  onOpenDriveConnect: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenDriveConnect }) => {
  const { user, logout } = useAuth();
  const [connectedCount, setConnectedCount] = useState(0);
  const [totalDrivesCount, setTotalDrivesCount] = useState(0);

  useEffect(() => {
    const syncCounts = () => {
      const accs = getKnownAndConnectedDriveAccounts();
      setTotalDrivesCount(accs.length);
      setConnectedCount(accs.filter((a) => a.connected).length);
    };
    syncCounts();
    return subscribeToDriveState(syncCounts);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const currentAccount = user?.email || user?.username || '20sgamingrohit@gmail.com';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 p-0.5 shadow-lg shadow-cyan-500/20 shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider text-sm sm:text-lg bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                CREATIVE INVENTOR LAB
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-widest uppercase bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                <ShieldCheck className="w-3 h-3" />
                Admin
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono hidden md:block">
              Cloud Storage & Multi-Drive Asset Portal
            </p>
          </div>
        </div>

        {/* Right Top-Corner Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 ml-auto flex-wrap justify-end">
          {/* Primary Top-Corner Option: Connect it to your Google Drive */}
          <button
            type="button"
            onClick={onOpenDriveConnect}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-emerald-500/20 hover:from-cyan-500/30 hover:to-emerald-500/30 border border-cyan-400/50 text-cyan-200 hover:text-white text-[11px] sm:text-xs font-bold transition shadow-md shadow-cyan-500/10 cursor-pointer"
          >
            <HardDrive className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="whitespace-nowrap">Connect it to your Google Drive</span>
            {totalDrivesCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold ${
                  connectedCount > 0
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                {connectedCount > 0 ? `${connectedCount} live` : `${totalDrivesCount}`}
              </span>
            )}
          </button>

          {/* Authorized Google Account Tag */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="Admin"
                className="w-4 h-4 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <UserIcon className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span className="font-semibold text-white truncate max-w-[180px]">
              {currentAccount}
            </span>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 text-[11px] sm:text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>LOGOUT</span>
          </button>
        </div>
      </div>
    </header>
  );
};
