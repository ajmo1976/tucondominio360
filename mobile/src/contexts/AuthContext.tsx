import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, getSession, login as apiLogin, logout as apiLogout } from '../lib/api';

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const s = await getSession();
      setSession(s);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const s = await apiLogin(email, password);
    setSession(s);
  };

  const logout = async () => {
    await apiLogout();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
