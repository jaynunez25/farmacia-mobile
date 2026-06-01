/**
 * Stock UI: caixas fechadas + lâminas soltas (Angola POS).
 * Total lâminas na BD = caixas * blisters_per_box + lâminas_soltas.
 * A separação caixas/soltas guarda-se em boxes/blisters (prateleira) e
 * loose_units/other_pack_count (armazém) para não perder 0 caixas + N soltas.
 */

export function blisterTotalFromParts(
  boxes: number,
  loose: number,
  blistersPerBox: number,
): number {
  const b = Math.max(1, Math.floor(blistersPerBox) || 1);
  return Math.max(0, Math.floor(boxes) || 0) * b + Math.max(0, Math.floor(loose) || 0);
}

/** Fallback when não há split guardado: divisão do total. */
export function blisterPartsFromTotal(
  total: number,
  blistersPerBox: number,
): { boxes: number; loose: number } {
  const t = Math.max(0, Math.floor(total) || 0);
  const b = Math.max(1, Math.floor(blistersPerBox) || 1);
  return { boxes: Math.floor(t / b), loose: t % b };
}

/** Prateleira: preferir boxes + blisters da API se bater certo com o total. */
export function shelfPartsFromProduct(
  shelfTotal: number,
  blistersPerBox: number,
  product?: { boxes?: number | null; blisters?: number | null } | null,
): { boxes: number; loose: number } {
  const b = Math.max(1, Math.floor(blistersPerBox) || 1);
  const t = Math.max(0, Math.floor(shelfTotal) || 0);
  if (product != null && (product.boxes != null || product.blisters != null)) {
    const bx = Math.max(0, Math.floor(Number(product.boxes) || 0));
    const lo = Math.max(0, Math.floor(Number(product.blisters) || 0));
    if (blisterTotalFromParts(bx, lo, b) === t) {
      return { boxes: bx, loose: lo };
    }
  }
  return blisterPartsFromTotal(t, b);
}

/** Armazém: loose_units = caixas, other_pack_count = lâminas soltas. */
export function warehousePartsFromProduct(
  warehouseTotal: number,
  blistersPerBox: number,
  product?: {
    loose_units?: number | null;
    other_pack_count?: number | null;
  } | null,
): { boxes: number; loose: number } {
  const b = Math.max(1, Math.floor(blistersPerBox) || 1);
  const t = Math.max(0, Math.floor(warehouseTotal) || 0);
  if (product != null && (product.loose_units != null || product.other_pack_count != null)) {
    const bx = Math.max(0, Math.floor(Number(product.loose_units) || 0));
    const lo = Math.max(0, Math.floor(Number(product.other_pack_count) || 0));
    if (blisterTotalFromParts(bx, lo, b) === t) {
      return { boxes: bx, loose: lo };
    }
  }
  return blisterPartsFromTotal(t, b);
}

export function blisterSplitPayloadForSave(
  shelfBoxes: number,
  shelfLoose: number,
  storageBoxes: number,
  storageLoose: number,
): {
  boxes: number;
  blisters: number;
  loose_units: number;
  other_pack_count: number;
} {
  return {
    boxes: Math.max(0, Math.floor(shelfBoxes) || 0),
    blisters: Math.max(0, Math.floor(shelfLoose) || 0),
    loose_units: Math.max(0, Math.floor(storageBoxes) || 0),
    other_pack_count: Math.max(0, Math.floor(storageLoose) || 0),
  };
}

/** Só quando loose >= bpp e bpp > 1 (ex.: 12 soltas, bpp 10 → 1 caixa + 2 soltas). */
export function normalizeBlisterParts(
  boxes: number,
  loose: number,
  blistersPerBox: number,
): { boxes: number; loose: number } | null {
  const b = Math.floor(blistersPerBox);
  if (b <= 1) return null;
  const extra = Math.floor(loose / b);
  if (extra <= 0) return null;
  return {
    boxes: boxes + extra,
    loose: loose % b,
  };
}

export function seedBlisterUiFromProduct(
  product: {
    shelf_stock_quantity?: number | null;
    warehouse_stock_quantity?: number | null;
    blisters_per_box?: number | null;
    units_per_pack?: number | null;
    boxes?: number | null;
    blisters?: number | null;
    loose_units?: number | null;
    other_pack_count?: number | null;
  },
  blistersPerBox: number,
): {
  shelfBoxes: number;
  shelfLoose: number;
  storageBoxes: number;
  storageLoose: number;
} {
  const shelf = Math.max(0, Math.floor(Number(product.shelf_stock_quantity) || 0));
  const wh = Math.max(0, Math.floor(Number(product.warehouse_stock_quantity) || 0));
  const sp = shelfPartsFromProduct(shelf, blistersPerBox, product);
  const wp = warehousePartsFromProduct(wh, blistersPerBox, product);
  return {
    shelfBoxes: sp.boxes,
    shelfLoose: sp.loose,
    storageBoxes: wp.boxes,
    storageLoose: wp.loose,
  };
}
