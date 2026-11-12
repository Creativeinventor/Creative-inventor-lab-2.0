import React, { createContext, useContext, useEffect, useState } from 'react';
import { subscribeToAuth, loginAdmin, logoutAdmin, getStoredDemoUser } from '../firebase/auth';
import { isFirebaseConfigured } from '../firebase/configManager';
import { AuthUser } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isConfigured: boolean;
  isDemo: boolean;
  login: (username: string, pass: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isConfigured = isFirebaseConfigured();

  useEffect(() => {
    if (!isConfigured) {
      // Check if active demo session exists
      const demo = getStoredDemoUser();
      setUser(demo);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isConfigured]);

  const handleLogin = async (username: string, pass: string): Promise<AuthUser> => {
    const loggedInUser = await loginAdmin(username, pass);
    setUser(loggedInUser);
    return loggedInUser;
  };

  const handleLogout = async (): Promise<void> => {
    await logoutAdmin();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isConfigured,
        isDemo: !isConfigured || Boolean(user?.isDemo),
        login: handleLogin,
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
