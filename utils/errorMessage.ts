/**
 * Turn any thrown value into a user-friendly message for display in the UI.
 */

const PRODUCTION_APP_URL = 'https://farmacia-mobile-opal.vercel.app';

export function getErrorMessage(error: unknown): string {
  if (error == null) {
    return `Falha inesperada. Abre ${PRODUCTION_APP_URL} no Chrome e tenta de novo.`;
  }
  if (typeof error === 'string') return error.trim() || `Falha inesperada. Tenta ${PRODUCTION_APP_URL}`;
  if (error instanceof Error) {
    const msg = error.message?.trim();
    if (msg) {
      const low = msg.toLowerCase();
      if (
        low.includes('failed to fetch') ||
        low.includes('network request failed') ||
        low.includes('network error') ||
        low.includes('load failed')
      ) {
        return `Sem ligação à API. Confirma dados móveis/Wi‑Fi e usa ${PRODUCTION_APP_URL} (Chrome).`;
      }
      if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('AbortError')) {
        return 'A ligação demorou demasiado. Internet lenta — tenta Wi‑Fi ou outra rede e espera ~1 minuto.';
      }
      if (
        msg.includes('Bad Gateway') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('Application failed to respond') ||
        msg.includes('ECONNREFUSED')
      ) {
        return 'Servidor em manutenção. Aguarda 2 minutos e tenta outra vez.';
      }
      if (msg.includes('Invalid username or password')) {
        return 'Utilizador ou palavra-passe incorrectos.';
      }
      if (msg.includes('EXPO_PUBLIC_API_URL') || msg.includes('API base URL')) {
        return `App desactualizada ou mal configurada. Usa ${PRODUCTION_APP_URL} no browser.`;
      }
      return msg;
    }
    return `Sem ligação ao servidor. Usa ${PRODUCTION_APP_URL} no Chrome (Android).`;
  }
  if (typeof error === 'object' && 'detail' in error) {
    const d = (error as { detail?: unknown }).detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      const parts = d.map((item) => {
        if (item && typeof item === 'object' && 'msg' in item)
          return String((item as { msg: unknown }).msg);
        return String(item);
      });
      if (parts.length) return parts.join('. ');
    }
  }
  return 'Não foi possível completar o pedido. Tenta outra vez.';
}

/** User-friendly messages for common API/validation cases */
export const VALIDATION_MESSAGES = {
  required: (field: string) => `${field} is required.`,
  mustBePositive: (field: string) => `${field} must be 0 or greater.`,
  skuExists: 'A product with this SKU already exists. Choose a different SKU or use the suggested one.',
  barcodeExists: 'A product with this barcode already exists.',
  productNotFound: 'Product not found. Check the barcode or search by name.',
  insufficientStock: (available: number) =>
    `Not enough stock. Only ${available} unit${available === 1 ? '' : 's'} available.`,
  saleFailed: 'Sale could not be completed. Check stock and try again.',
  loadFailed: (what: string) => `Could not load ${what}. Check your connection and try again.`,
  tryAgain: 'Please try again.',
} as const;
