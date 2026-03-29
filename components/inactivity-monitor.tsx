import { usePathname, useSegments } from 'expo-router';
import { type ReactNode, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';

/** Idle time before auto-logout (clears auth only; does not close cash session). */
const INACTIVITY_MS = 8 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Resets the idle clock on navigation (pathname/segments) and when the app returns to foreground.
 * Interval check only; same-screen interaction without route change may still trigger logout after the full idle window.
 */
export function InactivityMonitor({ children }: { children: ReactNode }) {
  const { logout, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const segments = useSegments();
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, [pathname, segments]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        lastActivityRef.current = Date.now();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!isAuthenticated) return;
      if (Date.now() - lastActivityRef.current >= INACTIVITY_MS) {
        void logout();
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, logout]);

  return <>{children}</>;
}
