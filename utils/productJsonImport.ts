import type { Product } from '@/types';

/** POST /products body shape (no server-generated fields). */
export type ProductCreateBody = Omit<
  Product,
  'id' | 'created_at' | 'updated_at' | 'warnings' | 'shelf_display' | 'stock_display_pack'
>;

export type JsonImportRowResult =
  | { index: number; status: 'ok'; sku: string; name: string; warnings?: string[] }
  | { index: number; status: 'error'; sku: string; name?: string; message: string };

const IMPORT_JSON_KEYS = new Set<string>([
  'sku',
  'name',
  'barcode',
  'documentary_name',
  'normalized_name',
  'search_name',
  'category',
  'category_code',
  'active_ingredient',
  'dosage',
  'form',
  'presentation',
  'brand',
  'manufacturer',
  'units_per_box',
  'units_per_blister',
  'shelf_location',
  'location',
  'image_url',
  'thumbnail_url',
  'selling_price',
  'cost_price',
  'cost_price_avg',
  'sale_price_box',
  'sale_price_blister',
  'min_sale_price',
  'price_source',
  'last_price_update',
  'needs_review',
  'stock_quantity',
  'minimum_stock',
  'batch_number',
  'expiry_date',
  'is_verified',
  'source_type',
  'can_sell_by_box',
  'can_sell_by_unit',
  'pack_name',
  'unit_name',
  'units_per_pack',
  'box_selling_price',
  'unit_selling_price',
  'needs_audit_review',
]);

export function baseProductCreateDefaults(): ProductCreateBody {
  return {
    sku: '',
    name: '',
    barcode: null,
    category: null,
    category_code: null,
    brand: null,
    dosage: null,
    form: null,
    selling_price: '0',
    cost_price: null,
    can_sell_by_box: false,
    can_sell_by_unit: false,
    pack_name: null,
    unit_name: null,
    units_per_pack: null,
    units_per_box: null,
    box_selling_price: null,
    unit_selling_price: null,
    stock_quantity: 0,
    minimum_stock: 0,
    batch_number: null,
    expiry_date: null,
    location: null,
    is_verified: false,
    source_type: null,
    initial_count_confirmed: false,
    is_expired: false,
    is_expiring_soon: false,
    documentary_name: null,
    normalized_name: null,
    search_name: null,
    active_ingredient: null,
    presentation: null,
    manufacturer: null,
    units_per_blister: null,
    shelf_location: null,
    image_url: null,
    thumbnail_url: null,
    cost_price_avg: '0',
    sale_price_box: '0',
    sale_price_blister: '0',
    min_sale_price: '0',
    price_source: 'manual',
    last_price_update: null,
    needs_review: false,
    needs_audit_review: false,
  };
}

function toOptionalIntGe1(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (Number.isNaN(n) || n < 1) return null;
  return n;
}

function toNonNegativeInt(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

function toDecimalStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = typeof v === 'number' ? String(v) : String(v).trim();
  return s === '' ? null : s;
}

function toSellingPriceString(v: unknown): string {
  const s = toDecimalStringOrNull(v);
  return s ?? '0';
}

export function mergeJsonImportRow(row: Record<string, unknown>): ProductCreateBody {
  const out = baseProductCreateDefaults();
  const o = out as Record<string, unknown>;
  for (const key of IMPORT_JSON_KEYS) {
    if (!(key in row) || row[key] === undefined) continue;
    const v = row[key];
    switch (key) {
      case 'selling_price':
        o[key] = toSellingPriceString(v);
        break;
      case 'cost_price':
      case 'cost_price_avg':
      case 'sale_price_box':
      case 'sale_price_blister':
      case 'min_sale_price':
      case 'box_selling_price':
      case 'unit_selling_price':
        o[key] = toDecimalStringOrNull(v);
        break;
      case 'stock_quantity':
        o[key] = toNonNegativeInt(v, 0);
        break;
      case 'minimum_stock':
        o[key] = toNonNegativeInt(v, 0);
        break;
      case 'units_per_box':
      case 'units_per_blister':
      case 'units_per_pack':
        o[key] = toOptionalIntGe1(v);
        break;
      case 'can_sell_by_box':
      case 'can_sell_by_unit':
      case 'is_verified':
      case 'needs_review':
      case 'needs_audit_review':
        o[key] = Boolean(v === true || v === 1 || v === '1');
        break;
      case 'last_price_update':
        if (v === null) o[key] = null;
        else if (typeof v === 'string') {
          const s = v.trim();
          o[key] = s === '' ? null : s;
        } else o[key] = String(v);
        break;
      default: {
        if (v === null) {
          o[key] = null;
        } else if (typeof v === 'string') {
          const s = v.trim();
          o[key] = s === '' ? null : s;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
          o[key] = String(v);
        } else {
          o[key] = null;
        }
      }
    }
  }
  return out;
}
