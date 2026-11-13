import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PublicFrontPage } from './pages/PublicFrontPage';
import { Sparkles, AlertTriangle } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#070a13] flex items-center justify-center p-6 text-slate-100">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
            <h1 className="text-lg font-bold text-white">CREATIVE INVENTOR LAB</h1>
            <p className="text-xs text-red-300 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type ViewMode = 'public' | 'admin-login' | 'admin';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('public');

  useEffect(() => {
    if (user && viewMode === 'admin-login') {
      setViewMode('admin');
    } else if (!user && viewMode === 'admin') {
      setViewMode('public');
    }
  }, [user, viewMode]);

  const handleOpenAdmin = () => {
    if (user) {
      setViewMode('admin');
    } else {
      setViewMode('admin-login');
    }
  };

  if (loading && viewMode !== 'public') {
    return (
      <div className="min-h-screen w-full bg-[#070a13] flex flex-col items-center justify-center text-slate-100">
        <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 p-0.5 shadow-2xl shadow-cyan-500/30 mb-6">
          <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-cyan-400 animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-mono text-cyan-300">
          <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <span>INITIALIZING CREATIVE INVENTOR LAB...</span>
        </div>
      </div>
    );
  }

  if (viewMode === 'admin' && user) {
    return <DashboardPage onViewFrontPage={() => setViewMode('public')} />;
  }

  if (viewMode === 'admin-login') {
    if (user) {
      return <DashboardPage onViewFrontPage={() => setViewMode('public')} />;
    }
    return (
      <LoginPage
        onSuccess={() => setViewMode('admin')}
        onBack={() => setViewMode('public')}
      />
    );
  }

  return (
    <PublicFrontPage
      onOpenAdmin={handleOpenAdmin}
      isAdminLoggedIn={Boolean(user)}
    />
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
