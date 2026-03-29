/** Canonical roles returned by the API after normalization. */
export const ROLE_ADMIN = 'admin';
export const ROLE_CASHIER = 'cashier';
export const ROLE_STOCK_AUDITOR = 'stock_auditor';

export function normalizeAppRole(role: string | undefined | null): string {
  if (!role) return ROLE_CASHIER;
  if (role === 'worker') return ROLE_CASHIER;
  if (role === 'auditor') return ROLE_STOCK_AUDITOR;
  return role;
}

export function isAdminRole(role: string | undefined | null): boolean {
  return normalizeAppRole(role) === ROLE_ADMIN;
}

export function isCashierRole(role: string | undefined | null): boolean {
  return normalizeAppRole(role) === ROLE_CASHIER;
}

export function isStockAuditorRole(role: string | undefined | null): boolean {
  return normalizeAppRole(role) === ROLE_STOCK_AUDITOR;
}
