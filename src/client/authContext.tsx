import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, UserSession } from './api.js';

interface AuthContextType {
  token: string | null;
  user: UserSession | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  loginAsDemo: (role: 'Admin' | 'Lead' | 'Member' | 'Viewer') => Promise<void>;
  logout: () => void;
  getUserRoleInTeam: (teamId: string) => 'Viewer' | 'Member' | 'Lead' | 'Admin' | null;
}

const DEMO_ACCOUNTS = {
  Admin: { email: 'alex.admin@newtonite.internal', pass: 'password123' },
  Lead: { email: 'sarah.lead@newtonite.internal', pass: 'password123' },
  Member: { email: 'dave.member@newtonite.internal', pass: 'password123' },
  Viewer: { email: 'sam.viewer@newtonite.internal', pass: 'password123' },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('newtonite_token'));
  const [user, setUser] = useState<UserSession | null>(() => {
    const cached = localStorage.getItem('newtonite_user');
    return cached ? JSON.parse(cached) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (token) {
      api.getMe(token)
        .then((res) => {
          setUser(res.user);
          localStorage.setItem('newtonite_user', JSON.stringify(res.user));
        })
        .catch(() => {
          logout();
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(email, pass);
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem('newtonite_token', res.token);
      localStorage.setItem('newtonite_user', JSON.stringify(res.user));
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsDemo = async (role: 'Admin' | 'Lead' | 'Member' | 'Viewer') => {
    const demo = DEMO_ACCOUNTS[role];
    await login(demo.email, demo.pass);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('newtonite_token');
    localStorage.removeItem('newtonite_user');
  };

  const getUserRoleInTeam = (teamId: string) => {
    if (!user) return null;
    const m = user.memberships.find((mem) => mem.team_id === teamId);
    return m ? m.role : null;
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoading,
        login,
        loginAsDemo,
        logout,
        getUserRoleInTeam,
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
