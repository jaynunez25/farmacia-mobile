import type { Product } from '@/types';

/** Total blisters → "2 caixas + 3 lâminas" */
export function formatBoxesLamina(total: number, blistersPerBox: number): string {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  const bpp = Math.max(0, Math.floor(Number(blistersPerBox) || 0));
  if (bpp <= 1) return String(t);
  const boxes = Math.floor(t / bpp);
  const lam = t % bpp;
  if (boxes === 0 && lam === 0) return '0 lâminas';
  if (lam === 0) return `${boxes} caixa${boxes === 1 ? '' : 's'}`;
  if (boxes === 0) return `${lam} lâmina${lam === 1 ? '' : 's'}`;
  return `${boxes} caixa${boxes === 1 ? '' : 's'} + ${lam} lâmina${lam === 1 ? '' : 's'}`;
}

/** Stock column on list screens (Stock tab, etc.). */
export function formatProductStockLabel(product: Product): string {
  const total = Math.max(0, Math.floor(Number(product.stock_quantity) || 0));
  if (!product.can_sell_by_unit) {
    return String(total);
  }
  const bpp =
    product.blisters_per_box != null && Number(product.blisters_per_box) >= 1
      ? Math.floor(Number(product.blisters_per_box))
      : product.units_per_pack != null && Number(product.units_per_pack) >= 1
        ? Math.floor(Number(product.units_per_pack))
        : 0;
  if (bpp > 1) {
    return formatBoxesLamina(total, bpp);
  }
  return String(total);
}
