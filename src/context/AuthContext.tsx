import React, { createContext, useContext, useEffect, useState } from 'react';
import { subscribeToAuth, loginWithGoogle, logoutAdmin } from '../firebase/auth';
import { isFirebaseConfigured } from '../firebase/configManager';
import { AuthUser } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isConfigured: boolean;
  authError: string | null;
  clearAuthError: () => void;
  loginWithGoogle: () => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const isConfigured = isFirebaseConfigured();

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    let resolved = false;
    const safetyTimer = setTimeout(() => {
      if (!resolved) {
        setLoading(false);
      }
    }, 2000);

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToAuth(
        (currentUser) => {
          resolved = true;
          clearTimeout(safetyTimer);
          setUser(currentUser);
          setLoading(false);
        },
        (unauthorizedMsg) => {
          setAuthError(unauthorizedMsg);
        }
      );
    } catch (err) {
      console.error('Auth subscription error:', err);
      resolved = true;
      clearTimeout(safetyTimer);
      setLoading(false);
    }

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [isConfigured]);

  const handleGoogleLogin = async (): Promise<AuthUser> => {
    setAuthError(null);
    const loggedInUser = await loginWithGoogle();
    setUser(loggedInUser);
    return loggedInUser;
  };

  const handleLogout = async (): Promise<void> => {
    setAuthError(null);
    await logoutAdmin();
    setUser(null);
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isConfigured,
        authError,
        clearAuthError,
        loginWithGoogle: handleGoogleLogin,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
