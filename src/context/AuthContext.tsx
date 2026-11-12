import React, { createContext, useContext, useEffect, useState } from 'react';
import { subscribeToAuth, loginAdmin, logoutAdmin } from '../firebase/auth';
import { isFirebaseConfigured } from '../firebase/configManager';
import { AuthUser } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isConfigured: boolean;
  login: (username: string, pass: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateUsernameState: (newUsername: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isConfigured = isFirebaseConfigured();

  useEffect(() => {
    if (!isConfigured) {
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

  const updateUsernameState = (newUsername: string) => {
    setUser((prev) => (prev ? { ...prev, username: newUsername, displayName: newUsername } : null));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isConfigured,
        login: handleLogin,
        logout: handleLogout,
        updateUsernameState,
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
