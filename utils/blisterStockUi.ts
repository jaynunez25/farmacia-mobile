/** UI helpers for caixas + lâminas soltas stock entry. */

export function isSingleBlisterPerBox(blistersPerBox: number): boolean {
  return blistersPerBox === 1;
}

/** Total lâminas from caixas + soltas (bpp=1: only loose counts). */
export function blisterTotalFromParts(
  boxes: number,
  loose: number,
  blistersPerBox: number,
): number {
  const b = Math.max(1, Math.floor(blistersPerBox) || 1);
  if (isSingleBlisterPerBox(b)) {
    return Math.max(0, Math.floor(loose) || 0);
  }
  return Math.max(0, Math.floor(boxes) || 0) * b + Math.max(0, Math.floor(loose) || 0);
}

/** Map API total → caixas + soltas for inputs. */
export function blisterPartsFromTotal(
  total: number,
  blistersPerBox: number,
): { boxes: number; loose: number } {
  const t = Math.max(0, Math.floor(total) || 0);
  const b = Math.max(1, Math.floor(blistersPerBox) || 1);
  if (isSingleBlisterPerBox(b)) {
    return { boxes: 0, loose: t };
  }
  return { boxes: Math.floor(t / b), loose: t % b };
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
