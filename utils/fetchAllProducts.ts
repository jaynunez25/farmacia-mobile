import { api } from '@/services/api';
import type { Product } from '@/types';

const PAGE_SIZE = 500;

/** Fetches every product page from GET /products until a short page (no silent truncation). */
export type FetchAllProductsFilters = {
  search?: string;
  category?: string;
  brand?: string;
  low_stock?: boolean;
  expiring_soon_days?: number;
};

export async function fetchAllProducts(filters: FetchAllProductsFilters): Promise<Product[]> {
  let skip = 0;
  const acc: Product[] = [];
  const maxPages = 200;

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await api.products.list({
      ...filters,
      skip,
      limit: PAGE_SIZE,
    });
    acc.push(...batch);
    if (batch.length < PAGE_SIZE) {
      break;
    }
    skip += PAGE_SIZE;
  }

  return acc;
}
