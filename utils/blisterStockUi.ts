/** UI helpers for caixas + lâminas soltas stock entry. */

export function isSingleBlisterPerBox(blistersPerBox: number): boolean {
  return blistersPerBox === 1;
}

/** Total lâminas from caixas + soltas. */
export function blisterTotalFromParts(
  boxes: number,
  loose: number,
  blistersPerBox: number,
): number {
  const b = Math.max(1, Math.floor(blistersPerBox) || 1);
  return Math.max(0, Math.floor(boxes) || 0) * b + Math.max(0, Math.floor(loose) || 0);
}

/** Map API total → caixas + soltas (division). */
export function blisterPartsFromTotal(
  total: number,
  blistersPerBox: number,
): { boxes: number; loose: number } {
  const t = Math.max(0, Math.floor(total) || 0);
  const b = Math.max(1, Math.floor(blistersPerBox) || 1);
  return { boxes: Math.floor(t / b), loose: t % b };
}

/** bpp=1: read shelf split persisted in product.boxes / product.blisters. */
export function shelfPartsFromProduct(
  shelfTotal: number,
  blistersPerBox: number,
  product?: {
    boxes?: number | null;
    blisters?: number | null;
  } | null,
): { boxes: number; loose: number } {
  const b = Math.max(1, Math.floor(blistersPerBox) || 1);
  const t = Math.max(0, Math.floor(shelfTotal) || 0);
  if (isSingleBlisterPerBox(b) && product) {
    const boxes = Math.max(0, Math.floor(Number(product.boxes) || 0));
    const loose = Math.max(0, Math.floor(Number(product.blisters) || 0));
    if (blisterTotalFromParts(boxes, loose, b) === t) {
      return { boxes, loose };
    }
  }
  return blisterPartsFromTotal(t, b);
}

/** bpp=1: read storage split in loose_units (caixas) / other_pack_count (soltas). */
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
  if (isSingleBlisterPerBox(b) && product) {
    const boxes = Math.max(0, Math.floor(Number(product.loose_units) || 0));
    const loose = Math.max(0, Math.floor(Number(product.other_pack_count) || 0));
    if (blisterTotalFromParts(boxes, loose, b) === t) {
      return { boxes, loose };
    }
  }
  return blisterPartsFromTotal(t, b);
}

/** Payload fields to persist caixas/soltas split when bpp === 1. */
export function blisterSplitPayloadForSave(
  blistersPerBox: number,
  shelfBoxes: number,
  shelfLoose: number,
  storageBoxes: number,
  storageLoose: number,
): Partial<{
  boxes: number;
  blisters: number;
  loose_units: number;
  other_pack_count: number;
}> {
  if (!isSingleBlisterPerBox(blistersPerBox)) {
    return {};
  }
  return {
    boxes: shelfBoxes,
    blisters: shelfLoose,
    loose_units: storageBoxes,
    other_pack_count: storageLoose,
  };
}

/**
 * Roll loose into full boxes when loose >= bpp (e.g. 5 soltas, bpp 3 → 1 caixa + 2 soltas).
 * Skipped when bpp === 1 (1 solta ≠ 1 caixa fechada).
 */
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
