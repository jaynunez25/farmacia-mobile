import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  DashboardStats,
  ExpiryAlertsResponse,
  ExpiryCounts,
  Product,
  Sale,
  SaleHistoryResponse,
  SaleSummaryResponse,
  StockMovement,
} from '../types';

// API URL: em produção deve apontar para Railway (nunca localhost/127/lan fixa).
const API_BASE_URL_RAW = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
const API_BASE_URL: string = API_BASE_URL_RAW.replace(/\/+$/, '');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const REQUEST_TIMEOUT_MS = 15000;

if (IS_PRODUCTION && !API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is required in production. Point it to your Railway backend URL.',
  );
}

const AUTH_TOKEN_KEY = 'pharmacy_token';

// In-memory cache of the auth token for this app session.
// This avoids depending solely on AsyncStorage for every request.
let inMemoryToken: string | null = null;

export async function getStoredToken(): Promise<string | null> {
  try {
    // If we already have the token in memory, prefer that.
    if (inMemoryToken) {
      return inMemoryToken;
    }
    const value = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    inMemoryToken = value;
    return inMemoryToken;
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string | null): Promise<void> {
  try {
    if (token) {
      inMemoryToken = token;
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      inMemoryToken = null;
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: (() => void) | null): void {
  onUnauthorized = cb;
}

function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error(
      'API base URL is not configured. Set EXPO_PUBLIC_API_URL in your .env to the Railway URL.',
    );
  }

  const token = await getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: ctrl.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  // Clear session on any unauthorized API response.
  if (res.status === 401) {
    await setStoredToken(null);
    onUnauthorized?.();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = (err as { detail?: unknown }).detail;
    let message: string;

    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((d: { loc?: string[]; msg?: string }) => {
          const msg = d?.msg ?? 'Invalid value';
          const field = Array.isArray(d?.loc) && d.loc.length > 1 ? d.loc[d.loc.length - 1] : null;
          return field ? `${String(field)}: ${msg}` : msg;
        })
        .join('. ');
    } else {
      message =
        res.status === 404
          ? 'Not found.'
          : res.status >= 500
            ? 'Server error. Please try again later.'
            : 'Request failed.';
    }

    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export interface AuthUser {
  id: number;
  username: string;
  display_name: string | null;
  role: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface CashSessionResponse {
  id: number;
  date: string;
  opened_by: number;
  opened_at: string;
  opening_float: string;
  opening_notes: string | null;
  opening_breakdown: Record<string, number> | null;
  status: string;
  closed_by: number | null;
  closed_at: string | null;
  actual_cash_counted: string | null;
  expected_cash: string | null;
  cash_difference: string | null;
  closing_notes: string | null;
  closing_breakdown: Record<string, number> | null;
  created_at: string;
  updated_at: string;
}

export interface CashSessionSummary {
  session: CashSessionResponse;
  total_cash_sales: string;
  total_card_sales: string;
  total_transfer_sales: string;
  total_other_sales: string;
  total_sales: string;
  cash_refunds: string;
  approved_cash_drops: string;
  expected_cash_in_till: string;
  transaction_count: number;
  voided_count: number;
}

export interface DailyClosingReport {
  session: CashSessionResponse;
  date: string;
  cashier_name: string | null;
  opening_float: string;
  cash_sales: string;
  card_sales: string;
  transfer_sales: string;
  other_sales: string;
  total_sales: string;
  expected_cash_in_till: string;
  actual_cash_counted: string;
  cash_difference: string;
  transaction_count: number;
  voided_count: number;
  notes: string | null;
  status: string;
  total_items_sold: number;
  low_stock_alert_count: number;
  expired_count: number;
  expiring_soon_count: number;
  audit_discrepancy_count: number;
}

export interface IncidentFlagResponse {
  id: number;
  type: string;
  reference_id: number | null;
  reference_type: string | null;
  severity: string;
  status: string;
  created_by: number | null;
  created_at: string;
  notes: string | null;
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    register: (data: { username: string; password: string; display_name?: string }) =>
      request<LoginResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<AuthUser>('/auth/me'),
    listUsers: () => request<AuthUser[]>('/auth/users'),
    createUser: (data: {
      username: string;
      password: string;
      display_name?: string;
      role: string;
    }) => request<AuthUser>('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (
      userId: number,
      data: { display_name?: string; role?: string; password?: string },
    ) =>
      request<AuthUser>(`/auth/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteUser: (userId: number) =>
      request<void>(`/auth/users/${userId}`, { method: 'DELETE' }),
  },
  products: {
    list: (params?: {
      search?: string;
      category?: string;
      brand?: string;
      low_stock?: boolean;
      expiring_soon_days?: number;
      skip?: number;
      limit?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params?.search) sp.set('search', params.search);
      if (params?.category) sp.set('category', params.category);
      if (params?.brand) sp.set('brand', params.brand);
      if (params?.low_stock === true) sp.set('low_stock', 'true');
      if (params?.expiring_soon_days != null) {
        sp.set('expiring_soon_days', String(params.expiring_soon_days));
      }
      if (params?.skip != null) sp.set('skip', String(params.skip));
      if (params?.limit != null) sp.set('limit', String(params.limit));
      const q = sp.toString();
      return request<Product[]>(`/products${q ? `?${q}` : ''}`);
    },
    getCategories: () => request<string[]>('/products/categories'),
    getBrands: () => request<string[]>('/products/brands'),
    suggestSku: (params?: { category?: string; name?: string }) => {
      const sp = new URLSearchParams();
      if (params?.category != null) sp.set('category', params.category);
      if (params?.name != null) sp.set('name', params.name);
      const q = sp.toString();
      return request<{ sku: string }>(`/products/suggest-sku${q ? `?${q}` : ''}`);
    },
    get: (id: number) => request<Product>(`/products/${id}`),
    getByBarcode: (barcode: string) =>
      request<Product>(`/products/by-barcode/${encodeURIComponent(barcode)}`),
    create: (data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) =>
      request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Product>) =>
      request<Product>(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: number) => request<void>(`/products/${id}`, { method: 'DELETE' }),
    initialCounts: {
      setBack: (productId: number, backCount: number) =>
        request<void>('/inventory-initial/back', {
          method: 'POST',
          body: JSON.stringify({ product_id: productId, back_count: backCount }),
        }),
      setFront: (productId: number, frontCount: number) =>
        request<void>('/inventory-initial/front', {
          method: 'POST',
          body: JSON.stringify({ product_id: productId, front_count: frontCount }),
        }),
      confirm: (productId: number) =>
        request<void>('/inventory-initial/confirm', {
          method: 'POST',
          body: JSON.stringify({ product_id: productId }),
        }),
    },
  },
  stockMovements: {
    list: (params?: { product_id?: number; movement_type?: string; skip?: number; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.product_id != null) sp.set('product_id', String(params.product_id));
      if (params?.movement_type) sp.set('movement_type', params.movement_type);
      if (params?.skip != null) sp.set('skip', String(params.skip));
      if (params?.limit != null) sp.set('limit', String(params.limit));
      const q = sp.toString();
      return request<StockMovement[]>(`/stock-movements${q ? `?${q}` : ''}`);
    },
    getProductHistory: (productId: number, params?: { skip?: number; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.skip != null) sp.set('skip', String(params.skip));
      if (params?.limit != null) sp.set('limit', String(params.limit));
      const q = sp.toString();
      return request<StockMovement[]>(
        `/stock-movements/product/${productId}${q ? `?${q}` : ''}`,
      );
    },
    create: (data: {
      product_id: number;
      movement_type: string;
      quantity: number;
      reason?: string;
      batch_number?: string;
      expiry_date?: string;
      performed_by?: number;
      admin_override?: boolean;
    }) =>
      request<StockMovement>('/stock-movements', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    addStock: (data: {
      product_id: number;
      quantity: number;
      movement_type: 'purchase' | 'return';
      reason?: string;
      batch_number?: string;
      expiry_date?: string;
      performed_by?: number;
    }) =>
      request<StockMovement>('/stock-movements/add', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    removeStock: (data: {
      product_id: number;
      quantity: number;
      movement_type: 'sale' | 'damaged' | 'expired';
      reason?: string;
      performed_by?: number;
      admin_override?: boolean;
    }) =>
      request<StockMovement>('/stock-movements/remove', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    adjustStock: (data: {
      product_id: number;
      quantity: number;
      reason?: string;
      performed_by?: number;
      admin_override?: boolean;
    }) =>
      request<StockMovement>('/stock-movements/adjust', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    auditCount: (data: {
      product_id: number;
      full_boxes: number;
      loose_units: number;
      reason?: string;
      performed_by?: number;
    }) =>
      request<StockMovement>('/stock-movements/audit-count', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  sales: {
    list: (params?: { skip?: number; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.skip != null) sp.set('skip', String(params.skip));
      if (params?.limit != null) sp.set('limit', String(params.limit));
      const q = sp.toString();
      return request<Sale[]>(`/sales${q ? `?${q}` : ''}`);
    },
    get: (id: number) => request<Sale>(`/sales/${id}`),
    create: (data: {
      items: {
        product_id: number;
        quantity: number;
        unit_price: string;
        sell_as?: 'box' | 'unit';
      }[];
      user_id?: number;
      payment_method?: string;
      payments?: {
        payment_method: string;
        amount: number;
        tendered_amount?: number;
        change_given?: number;
      }[];
      cash_received?: number;
      cash_change?: number;
      idempotency_key?: string;
    }) => {
      const { idempotency_key, ...payload } = data;
      return request<Sale>('/sales', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Idempotency-Key': idempotency_key ?? createIdempotencyKey('sale'),
        },
      });
    },
    voidSale: (saleId: number) =>
      request<Sale>(`/sales/${saleId}/void`, { method: 'POST' }),
    getHistory: (params?: {
      skip?: number;
      limit?: number;
      date_from?: string;
      date_to?: string;
      product_name?: string;
      sku?: string;
      barcode?: string;
      sold_by?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params?.skip != null) sp.set('skip', String(params.skip));
      if (params?.limit != null) sp.set('limit', String(params.limit));
      if (params?.date_from) sp.set('date_from', params.date_from);
      if (params?.date_to) sp.set('date_to', params.date_to);
      if (params?.product_name) sp.set('product_name', params.product_name);
      if (params?.sku) sp.set('sku', params.sku);
      if (params?.barcode) sp.set('barcode', params.barcode);
      if (params?.sold_by != null) sp.set('sold_by', String(params.sold_by));
      const q = sp.toString();
      return request<SaleHistoryResponse>(`/sales/history${q ? `?${q}` : ''}`);
    },
    getHistorySummary: (params?: { date_from?: string; date_to?: string }) => {
      const sp = new URLSearchParams();
      if (params?.date_from) sp.set('date_from', params.date_from);
      if (params?.date_to) sp.set('date_to', params.date_to);
      const q = sp.toString();
      return request<SaleSummaryResponse>(`/sales/history/summary${q ? `?${q}` : ''}`);
    },
    getSoldByOptions: () => request<number[]>('/sales/history/sold-by'),
  },
  expiryAlerts: {
    get: (params?: { category?: string; brand?: string }) => {
      const sp = new URLSearchParams();
      if (params?.category) sp.set('category', params.category);
      if (params?.brand) sp.set('brand', params.brand);
      const q = sp.toString();
      return request<ExpiryAlertsResponse>(`/expiry-alerts${q ? `?${q}` : ''}`);
    },
    getCounts: () => request<ExpiryCounts>('/expiry-alerts/counts'),
  },
  cashSessions: {
    open: (data: {
      opening_float: number | string;
      notes?: string;
      opening_breakdown?: Record<string, number>;
    }) =>
      request<CashSessionResponse>('/cash-sessions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    close: (data: {
      actual_cash_counted: number | string;
      notes?: string;
      closing_breakdown?: Record<string, number>;
    }) =>
      request<CashSessionResponse>('/cash-sessions/close', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getCurrent: () => request<CashSessionSummary>('/cash-sessions/current'),
    list: (params?: {
      date_from?: string;
      date_to?: string;
      opened_by?: number;
      status?: string;
      skip?: number;
      limit?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params?.date_from) sp.set('date_from', params.date_from);
      if (params?.date_to) sp.set('date_to', params.date_to);
      if (params?.opened_by != null) sp.set('opened_by', String(params.opened_by));
      if (params?.status) sp.set('status', params.status);
      if (params?.skip != null) sp.set('skip', String(params.skip));
      if (params?.limit != null) sp.set('limit', String(params.limit));
      const q = sp.toString();
      return request<CashSessionResponse[]>(`/cash-sessions${q ? `?${q}` : ''}`);
    },
    getReport: (sessionId: number) =>
      request<DailyClosingReport>(`/cash-sessions/report/${sessionId}`),
    correct: (sessionId: number, data: { opening_float?: number; notes?: string }) =>
      request<CashSessionResponse>(`/cash-sessions/${sessionId}/correct`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    listIncidents: (params?: { status?: string; type?: string; skip?: number; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.status) sp.set('status', params.status);
      if (params?.type) sp.set('type', params.type);
      if (params?.skip != null) sp.set('skip', String(params.skip));
      if (params?.limit != null) sp.set('limit', String(params.limit));
      const q = sp.toString();
      return request<IncidentFlagResponse[]>(`/cash-sessions/incidents${q ? `?${q}` : ''}`);
    },
  },
  dashboard: {
    get: (params?: {
      low_stock_limit?: number;
      expiring_days?: number;
      recent_sales_count?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params?.low_stock_limit != null) {
        sp.set('low_stock_limit', String(params.low_stock_limit));
      }
      if (params?.expiring_days != null) {
        sp.set('expiring_days', String(params.expiring_days));
      }
      if (params?.recent_sales_count != null) {
        sp.set('recent_sales_count', String(params.recent_sales_count));
      }
      const q = sp.toString();
      return request<DashboardStats>(`/dashboard${q ? `?${q}` : ''}`);
    },
  },
  attendance: {
    clockIn: (data: { latitude: number; longitude: number }) =>
      request<{ ok: boolean; clocked_at: string; record_id: number }>('/attendance/clock-in', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    clockOut: (data: { latitude: number; longitude: number }) =>
      request<{ ok: boolean; clocked_at: string; record_id: number }>('/attendance/clock-out', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getStatus: () =>
      request<{
        clocked_in_at: string | null;
        clocked_out_at: string | null;
        is_clocked_in: boolean;
      }>('/attendance/status'),
  },
};

