import type { DashboardStats, Product } from '../types';

export type AuthUserLike = { display_name?: string | null; username?: string } | null | undefined;

/**
 * Greeting by time of day. No user name — combine with getDisplayName for full greeting.
 */
export function getGreetingByTime(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * First name or username for greeting. Returns empty string if no user so header can show just "Bom dia".
 */
export function getDisplayName(user: AuthUserLike): string {
  if (!user) return '';
  const raw = user.display_name || user.username || '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord || trimmed;
}

/**
 * Days until expiry (0 = today, negative = past). Handles invalid dates.
 */
export function getDaysUntilExpiry(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  if (Number.isNaN(exp.getTime())) return null;
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/** Priority order: expired > low stock > expiring soon > none */
export type PriorityAlertType = 'expired' | 'low_stock' | 'expiring' | 'none';

export interface PriorityAlertConfig {
  type: PriorityAlertType;
  title: string;
  message: string;
  subtitle: string;
  primaryLabel: string;
  variant: 'danger' | 'warning' | 'caution' | 'success';
}

export function getPriorityAlertType(data: DashboardStats): PriorityAlertType {
  if (data.expired_count > 0) return 'expired';
  if (data.low_stock_count > 0) return 'low_stock';
  if (data.expiring_soon_count > 0) return 'expiring';
  return 'none';
}

export function getPriorityAlertCopy(data: DashboardStats): Omit<PriorityAlertConfig, 'type'> {
  const type = getPriorityAlertType(data);

  if (type === 'expired') {
    return {
      title: 'Atenção urgente',
      message: `${data.expired_count} produtos expirados`,
      subtitle: 'Revê estes itens o mais rápido possível.',
      primaryLabel: 'Ver expirados',
      variant: 'danger',
    };
  }

  if (type === 'low_stock') {
    return {
      title: 'Atenção hoje',
      message: `${data.low_stock_count} produtos com stock baixo`,
      subtitle: 'Repor agora para evitar ruturas nos próximos dias.',
      primaryLabel: 'Ver produtos em risco',
      variant: 'warning',
    };
  }

  if (type === 'expiring') {
    return {
      title: 'Validades a acompanhar',
      message: `${data.expiring_soon_count} produtos a expirar em breve`,
      subtitle: 'Confirma os produtos com validade próxima.',
      primaryLabel: 'Ver validades',
      variant: 'caution',
    };
  }

  return {
    title: 'Tudo sob controlo',
    message: 'Não há alertas críticos neste momento',
    subtitle: 'O inventário está estável hoje.',
    primaryLabel: 'Ver inventário',
    variant: 'success',
  };
}

/**
 * Total number of items needing attention (for subtitle).
 */
export function getAlertCount(data: DashboardStats): number {
  return data.expired_count + data.low_stock_count + data.expiring_soon_count;
}

export type AttentionItemType = 'low_stock' | 'expiring' | 'expired' | 'best_seller';

export type AttentionIconVariant = 'warning' | 'expiring' | 'expired' | 'best_seller';

export interface AttentionItem {
  id: string;
  type: AttentionItemType;
  product: Product;
  productName: string;
  reason: string;
  icon: string;
  iconVariant: AttentionIconVariant;
}

/** Símbolos: stock crítico = ! (amarelo), expirar = relógio (vermelho), mais vendidos = seta (verde) */
const ICON_WARNING = '!';
const ICON_EXPIRING = '◷'; /* clock / tempo */
const ICON_BEST_SELLER = '↗'; /* seta subir = mais vendido */

/**
 * Build list of products needing attention from API data.
 * Três categorias: Stock crítico, A expirar, Mais vendidos (dados reais da base).
 */
export function getAttentionItems(
  lowStockProducts: Product[],
  expiringProducts: Product[],
  topSoldProducts: Product[],
  maxItems: number = 8
): AttentionItem[] {
  const items: AttentionItem[] = [];

  lowStockProducts.slice(0, 3).forEach((p) => {
    const critical = p.stock_quantity === 0;
    items.push({
      id: `low-${p.id}`,
      type: 'low_stock',
      product: p,
      productName: p.name,
      reason: critical
        ? 'Stock esgotado!'
        : `Stock crítico! Só restam ${p.stock_quantity} unidades`,
      icon: ICON_WARNING,
      iconVariant: 'warning',
    });
  });

  expiringProducts.slice(0, 3).forEach((p) => {
    const days = getDaysUntilExpiry(p.expiry_date);
    const reason =
      days === null
        ? 'Validade a verificar'
        : days <= 0
          ? 'Produto expirado'
          : `Expira em ${days} dias`;
    const isExpired = days !== null && days <= 0;
    items.push({
      id: `exp-${p.id}`,
      type: isExpired ? 'expired' : 'expiring',
      product: p,
      productName: p.name,
      reason,
      icon: ICON_EXPIRING,
      iconVariant: isExpired ? 'expired' : 'expiring',
    });
  });

  topSoldProducts.slice(0, 3).forEach((p) => {
    items.push({
      id: `top-${p.id}`,
      type: 'best_seller',
      product: p,
      productName: p.name,
      reason: 'Produto mais vendido, sem reposição recente',
      icon: ICON_BEST_SELLER,
      iconVariant: 'best_seller',
    });
  });

  return items.slice(0, maxItems);
}

/** Count of critical low stock (0 or ≤2 units). */
export function countCriticalLowStock(lowStockProducts: Product[]): number {
  return lowStockProducts.filter((p) => p.stock_quantity === 0 || p.stock_quantity <= 2).length;
}
