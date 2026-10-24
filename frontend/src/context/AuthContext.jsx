import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    authService
      .me()
      .then((d) => alive && setUser(d.user))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false));
    const onExpired = () => setUser(null);
    window.addEventListener('vp:auth-expired', onExpired);
    return () => {
      alive = false;
      window.removeEventListener('vp:auth-expired', onExpired);
    };
  }, []);

  const login = useCallback(async (payload) => {
    const d = await authService.login(payload);
    setUser(d.user);
    return d.user;
  }, []);
  const register = useCallback(async (payload) => {
    const d = await authService.register(payload);
    setUser(d.user);
    return d.user;
  }, []);
  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, setUser }),
    [user, loading, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
