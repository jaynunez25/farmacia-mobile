/**
 * POS labels for "sell by strip/unit" — prefer explicit `unit_name`, else infer from
 * form, name, and category (same signals staff use when reading the box; not from photos).
 */

export type RetailUnitLabelSource = {
  unit_name?: string | null;
  form?: string | null;
  name?: string | null;
  category?: string | null;
};

type UnitKind =
  | 'capsule'
  | 'tablet'
  | 'dragee'
  | 'suppository'
  | 'lozenge'
  | 'sachet'
  | 'blister';

const KIND_LABELS: Record<
  UnitKind,
  { singularTitle: string; singularLower: string; pluralLower: string }
> = {
  capsule: { singularTitle: 'Cápsula', singularLower: 'cápsula', pluralLower: 'cápsulas' },
  tablet: { singularTitle: 'Comprimido', singularLower: 'comprimido', pluralLower: 'comprimidos' },
  dragee: { singularTitle: 'Drageia', singularLower: 'drageia', pluralLower: 'drageias' },
  suppository: {
    singularTitle: 'Supositório',
    singularLower: 'supositório',
    pluralLower: 'supositórios',
  },
  lozenge: { singularTitle: 'Pastilha', singularLower: 'pastilha', pluralLower: 'pastilhas' },
  sachet: { singularTitle: 'Sobre', singularLower: 'sobre', pluralLower: 'sobres' },
  blister: { singularTitle: 'Lâmina', singularLower: 'lâmina', pluralLower: 'lâminas' },
};

function foldPackagingText(v: string | null | undefined): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function packText(p: RetailUnitLabelSource): string {
  return `${foldPackagingText(p.form)} ${foldPackagingText(p.name)} ${foldPackagingText(p.category)}`;
}

function inferKind(p: RetailUnitLabelSource): UnitKind {
  const text = packText(p);
  if (/(sobre|sachet|saquet|envelope|stick pack)/.test(text)) return 'sachet';
  if (/(supositorio|suppository)/.test(text)) return 'suppository';
  if (/(drageia|dragee)/.test(text)) return 'dragee';
  if (/(pastilha|lozenge|gargant)/.test(text)) return 'lozenge';
  if (/(capsula|capsule)/.test(text)) return 'capsule';
  if (/(comprimido|tablet|\bpill\b)/.test(text)) return 'tablet';
  return 'blister';
}

function explicitFoldedToPluralLower(folded: string): string | null {
  const map: Record<string, string> = {
    capsula: 'cápsulas',
    capsulas: 'cápsulas',
    comprimido: 'comprimidos',
    comprimidos: 'comprimidos',
    drageia: 'drageias',
    drageias: 'drageias',
    supositorio: 'supositórios',
    supositorios: 'supositórios',
    pastilha: 'pastilhas',
    pastilhas: 'pastilhas',
    lamina: 'lâminas',
    laminas: 'lâminas',
    unidade: 'unidades',
    unidades: 'unidades',
    sobre: 'sobres',
    sobres: 'sobres',
    ampola: 'ampolas',
    ampolas: 'ampolas',
  };
  return map[folded] ?? null;
}

export function getRetailUnitLabelSingularTitle(p: RetailUnitLabelSource): string {
  const raw = (p.unit_name ?? '').trim();
  if (raw) {
    const f = foldPackagingText(raw);
    const hit = explicitFoldedToPluralLower(f);
    if (hit) {
      const kind = (Object.keys(KIND_LABELS) as UnitKind[]).find(k => KIND_LABELS[k].pluralLower === hit);
      if (kind) return KIND_LABELS[kind].singularTitle;
    }
    return raw.charAt(0).toLocaleUpperCase('pt-PT') + raw.slice(1);
  }
  return KIND_LABELS[inferKind(p)].singularTitle;
}

export function getRetailUnitPluralLower(p: RetailUnitLabelSource): string {
  const raw = (p.unit_name ?? '').trim();
  if (raw) {
    const hit = explicitFoldedToPluralLower(foldPackagingText(raw));
    if (hit) return hit;
    return raw.toLowerCase();
  }
  return KIND_LABELS[inferKind(p)].pluralLower;
}

export function getRetailUnitSingularLower(p: RetailUnitLabelSource): string {
  const raw = (p.unit_name ?? '').trim();
  if (raw) {
    const f = foldPackagingText(raw);
    const pl = explicitFoldedToPluralLower(f);
    if (pl) {
      const kind = (Object.keys(KIND_LABELS) as UnitKind[]).find(k => KIND_LABELS[k].pluralLower === pl);
      if (kind) return KIND_LABELS[kind].singularLower;
    }
    return raw.toLowerCase();
  }
  return KIND_LABELS[inferKind(p)].singularLower;
}

export function getRetailUnitWordForCount(n: number, p: RetailUnitLabelSource): string {
  const abs = Math.abs(Math.trunc(Number(n) || 0));
  return abs === 1 ? getRetailUnitSingularLower(p) : getRetailUnitPluralLower(p);
}

export function getRetailUnitPluralTitle(p: RetailUnitLabelSource): string {
  const s = getRetailUnitPluralLower(p);
  if (!s) return '';
  return s.charAt(0).toLocaleUpperCase('pt-PT') + s.slice(1);
}

export function stockInsufficientRetailMessage(
  option: 'box' | 'blister' | 'bottle' | 'ampoule',
  p: RetailUnitLabelSource,
): string {
  if (option === 'box') return 'Stock insuficiente para vender esta quantidade de caixas.';
  if (option === 'blister')
    return `Stock insuficiente para vender esta quantidade de ${getRetailUnitPluralLower(p)}.`;
  if (option === 'bottle') return 'Stock insuficiente para vender esta quantidade de frascos.';
  return 'Stock insuficiente para vender esta quantidade de ampolas.';
}
