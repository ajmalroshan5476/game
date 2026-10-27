import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAuthToken, loadStoredToken } from '../api/client';

export interface User {
  id: string;
  orgId: string;
  username: string;
  role: 'ADMIN' | 'USER';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, pass: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Attempt to restore token
    (async () => {
      try {
        const stored = await loadStoredToken();
        if (stored) {
          setToken(stored);
          const me = await api.getMe();
          if (me?.user) {
            setUser({
              id: me.user.userId,
              orgId: me.user.orgId,
              username: me.user.username,
              role: me.user.role,
            });
          }
        }
      } catch (e) {
        setAuthToken(null);
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, pass: string) => {
    const res = await api.login(username, pass);
    setAuthToken(res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
