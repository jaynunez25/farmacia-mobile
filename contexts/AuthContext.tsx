import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  api,
  getStoredToken,
  setStoredToken,
  setOnUnauthorized,
  type AuthUser,
  type LoginResponse,
} from '../services/api';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<LoginResponse>;
  register: (data: { username: string; password: string; display_name?: string }) => Promise<LoginResponse>;
  /** After register, call this with the API response to log in without password again. */
  setAuthFromResponse: (res: LoginResponse) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      const token = await getStoredToken();
      if (!isMounted) return;

      if (!token) {
        setState({ user: null, token: null, loading: false });
        return;
      }

      try {
        const user = await api.auth.me();
        if (!isMounted) return;
        setState({ user, token, loading: false });
      } catch {
        await setStoredToken(null);
        if (!isMounted) return;
        setState({ user: null, token: null, loading: false });
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshUser = useCallback(async () => {
    const token = await getStoredToken();
    if (!token) {
      setState((s) => ({ ...s, user: null, token: null, loading: false }));
      return;
    }
    try {
      const user = await api.auth.me();
      setState((s) => ({ ...s, user, token, loading: false }));
    } catch {
      await setStoredToken(null);
      setState((s) => ({ ...s, user: null, token: null, loading: false }));
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.auth.login(username, password);
    await setStoredToken(res.access_token);
    setState({ user: res.user, token: res.access_token, loading: false });
    return res;
  }, []);

  const register = useCallback(
    async (data: { username: string; password: string; display_name?: string }) => {
      const res = await api.auth.register(data);
      await setStoredToken(res.access_token);
      setState({ user: res.user, token: res.access_token, loading: false });
      return res;
    },
    [],
  );

  const setAuthFromResponse = useCallback((res: LoginResponse) => {
    void setStoredToken(res.access_token);
    setState({ user: res.user, token: res.access_token, loading: false });
  }, []);

  const logout = useCallback(async () => {
    await setStoredToken(null);
    setState({ user: null, token: null, loading: false });
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      void logout();
    });
    return () => setOnUnauthorized(null);
  }, [logout]);

  const value: AuthContextValue = useMemo(
    () => ({
      user: state.user,
      token: state.token,
      isLoading: state.loading,
      isAuthenticated: Boolean(state.user && state.token),
      login,
      register,
      setAuthFromResponse,
      logout,
      refreshUser,
    }),
    [state.user, state.token, state.loading, login, register, logout, refreshUser, setAuthFromResponse],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}

