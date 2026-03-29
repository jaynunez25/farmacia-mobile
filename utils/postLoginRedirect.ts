import type { Href } from 'expo-router';

import { api } from '@/services/api';
import { normalizeAppRole } from '@/utils/roles';

/**
 * After authentication: cashiers/admins with an open store session go to the dashboard;
 * otherwise open the Caixa tab (opening flow). Stock auditors skip caixa and go to dashboard.
 */
export async function redirectAfterAuthentication(
  replace: (href: Href) => void,
  userRole: string,
): Promise<void> {
  const role = normalizeAppRole(userRole);
  if (role === 'stock_auditor') {
    replace('/(tabs)/dashboard');
    return;
  }
  try {
    await api.cashSessions.getCurrent();
    replace('/(tabs)/dashboard');
  } catch {
    replace('/(tabs)/caixa');
  }
}
