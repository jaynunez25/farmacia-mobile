/**
 * Display-only Kwanza formatting for POS: thousands with dots, integer Kz, no cents.
 * Does not change stored amounts or API payloads — use only for UI labels.
 */
export type FormatCurrencyOptions = {
  /** When true, positive amounts show a leading "+" (e.g. cash differences). */
  signed?: boolean;
};

function parseNumeric(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const s = String(value).trim().replace(/\s/g, '');
  if (s === '') return NaN;
  return Number(s.replace(',', '.'));
}

export function formatCurrency(
  value: string | number | null | undefined,
  options?: FormatCurrencyOptions,
): string {
  const n = parseNumeric(value);
  if (!Number.isFinite(n)) {
    if (typeof value === 'string' && value.trim() !== '') {
      return `${value.trim()} Kz`;
    }
    return '0 Kz';
  }
  const rounded = Math.round(n);
  const signed = options?.signed === true;
  const sign = rounded < 0 ? '-' : signed && rounded > 0 ? '+' : '';
  const abs = Math.abs(rounded);
  const body = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${body} Kz`;
}
