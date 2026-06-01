/** Parse a price field from form/API (comma or dot decimal). */
export function parsePriceKz(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const t = String(value).trim().replace(',', '.');
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Format Kz for API/form (integers without decimals). */
export function formatPriceKz(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/** Box price = blisters per box × blister unit price. */
export function computeBoxPriceFromBlister(
  blisterPrice: number,
  blistersPerBox: number,
): string | null {
  const bpp = Math.floor(blistersPerBox);
  if (bpp < 1 || blisterPrice < 0) return null;
  return formatPriceKz(blisterPrice * bpp);
}

export function effectiveBlistersPerBox(
  blistersPerBox: number | null | undefined,
  unitsPerPack: number | null | undefined,
): number {
  if (blistersPerBox != null && Number(blistersPerBox) >= 1) return Math.floor(Number(blistersPerBox));
  if (unitsPerPack != null && Number(unitsPerPack) >= 1) return Math.floor(Number(unitsPerPack));
  return 0;
}

export function blisterUnitPriceFromProduct(product: {
  sale_price_blister?: string | number | null;
  unit_selling_price?: string | number | null;
}): number | null {
  return (
    parsePriceKz(product.sale_price_blister) ??
    parsePriceKz(product.unit_selling_price)
  );
}

type BoxPriceFields = {
  sale_price_box?: string | number | null;
  selling_price?: string | number | null;
  box_selling_price?: string | number | null;
};

/** When blister price and blisters/box are set, derive box price (lâmina × quantidade). */
export function withBoxPriceFromBlister<T extends BoxPriceFields & {
  can_sell_by_unit?: boolean | null;
  blisters_per_box?: number | null;
  units_per_pack?: number | null;
}>(product: T): T {
  if (!product.can_sell_by_unit) return product;
  const bpp = effectiveBlistersPerBox(product.blisters_per_box, product.units_per_pack);
  const blister = blisterUnitPriceFromProduct(product);
  if (bpp < 1 || blister == null || blister <= 0) return product;
  const next = computeBoxPriceFromBlister(blister, bpp);
  if (!next) return product;
  return {
    ...product,
    sale_price_box: next,
    selling_price: next,
    box_selling_price: next,
  };
}

/** Create form: preço de venda (caixa) = preço da lâmina × lâminas por caixa. */
export function withSellingPriceFromBlisterForm<T extends {
  can_sell_by_unit: boolean;
  blisters_per_box: string | number;
  units_per_pack?: string | number;
  unit_selling_price: string;
  selling_price: string;
}>(form: T): T {
  if (!form.can_sell_by_unit) return form;
  const bpp =
    form.blisters_per_box !== '' && form.blisters_per_box != null
      ? Number(form.blisters_per_box)
      : form.units_per_pack !== '' && form.units_per_pack != null
        ? Number(form.units_per_pack)
        : 0;
  const blister = parsePriceKz(form.unit_selling_price);
  if (!Number.isFinite(bpp) || bpp < 1 || blister == null || blister <= 0) return form;
  const next = computeBoxPriceFromBlister(blister, bpp);
  if (!next) return form;
  return { ...form, selling_price: next };
}
