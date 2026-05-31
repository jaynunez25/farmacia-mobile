const LIQUID_FORM_SUBSTRINGS = ['xarope', 'suspensao', 'solucao oral', 'gotas', 'frasco', 'liquido'] as const;

function foldPharmaceuticalForm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Matches backend `is_liquid_pharmaceutical_form` (pharmaceutical `form` field). */
export function isLiquidPharmaceuticalForm(form: string | null | undefined): boolean {
  if (!form || !String(form).trim()) return false;
  const folded = foldPharmaceuticalForm(String(form).trim());
  return LIQUID_FORM_SUBSTRINGS.some((k) => folded.includes(k));
}
