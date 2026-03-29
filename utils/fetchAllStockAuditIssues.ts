import { api } from '@/services/api';
import type { StockAuditIssue } from '@/types';

const PAGE_SIZE = 500;

/** Fetches every stock-audit-issues page until a short page (no silent truncation). */
export async function fetchAllStockAuditIssues(params?: {
  status?: string;
  product_id?: number;
}): Promise<StockAuditIssue[]> {
  let skip = 0;
  const acc: StockAuditIssue[] = [];
  const maxPages = 200;

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await api.stockAuditIssues.list({
      ...params,
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
