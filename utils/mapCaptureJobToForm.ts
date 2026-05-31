import type { CaptureJob, ExtractedField } from '@/services/aiCapture';
import { isLiquidPharmaceuticalForm } from '@/utils/liquidPharmaceuticalForm';

export type ProdutoCriarFormDraft = {
  sku: string;
  barcode: string;
  name: string;
  documentary_name: string;
  category: string;
  brand: string;
  form: string;
  notes: string;
  selling_price: string;
  cost_price: string;
  can_sell_by_unit: boolean;
  pack_name: string;
  unit_name: string;
  blisters_per_box: string | number;
  units_per_pack: string | number;
  units_per_box: string | number;
  units_per_blister: string | number;
  unit_selling_price: string;
  shelf_stock_quantity: number;
  warehouse_stock_quantity: number;
  minimum_stock: number;
  batch_number: string;
  expiry_date: string;
  location: string;
  image_url: string;
  thumbnail_url: string;
};

function fieldMap(fields: ExtractedField[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) {
    if (f.suggested_value != null) m[f.field_key] = f.suggested_value;
  }
  return m;
}

function parseIntField(raw: string | undefined): string | number {
  if (!raw?.trim()) return '';
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? '' : n;
}

function guessCategoryFromForm(form: string): string {
  const f = form
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/(comprimido|capsula|xarope|suspens|ampola|injec|liquido)/.test(f)) return 'Medicamentos';
  if (/(creme|pomada|gel)/.test(f)) return 'Dermocosmética';
  return '';
}

/** Map AI job → same fields as produto-criar (prices stay empty for human input). */
export function mapCaptureJobToFormDraft(job: CaptureJob): Partial<ProdutoCriarFormDraft> {
  const fm = fieldMap(job.fields);
  const formStr = (fm.form ?? '').trim();
  const liquid = isLiquidPharmaceuticalForm(formStr);

  let canSellUnit = fm.can_sell_by_unit === 'true';
  const bpp = parseIntField(fm.blisters_per_box);
  if (liquid) {
    canSellUnit = false;
  } else if (typeof bpp === 'number' && bpp <= 1) {
    canSellUnit = false;
  }

  const thumb = (fm.thumbnail_url ?? job.thumbnail_path ?? '').trim();
  const image = (fm.image_url ?? job.cleaned_image_path ?? '').trim();

  const category = (fm.category ?? '').trim() || guessCategoryFromForm(formStr);
  const unitFromAi = (fm.unit_name ?? '').trim();
  const bppNum = typeof bpp === 'number' ? bpp : 0;

  return {
    name: (fm.name ?? '').trim(),
    documentary_name: (fm.documentary_name ?? '').trim(),
    brand: (fm.brand ?? '').trim(),
    category,
    form: formStr,
    notes: (fm.notes ?? '').trim(),
    barcode: (fm.barcode ?? '').trim(),
    blisters_per_box: liquid ? '' : bpp,
    units_per_blister: '',
    can_sell_by_unit: canSellUnit,
    pack_name: liquid ? 'Frasco' : canSellUnit ? 'Caixa' : '',
    unit_name: unitFromAi || (liquid ? 'Frasco' : canSellUnit && bppNum >= 1 ? 'Lâmina' : ''),
    image_url: image,
    thumbnail_url: thumb,
    // prices, sku, barcode, stock — utilizador preenche no mesmo formulário
  };
}
