/**
 * Turn any thrown value into a user-friendly message for display in the UI.
 */

export function getErrorMessage(error: unknown): string {
    if (error == null) return 'Something went wrong.';
    if (typeof error === 'string') return error;
    if (error instanceof Error) {
      const msg = error.message?.trim();
      if (msg) {
        if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network'))
          return 'Falha de ligação. Verifica a internet e tenta outra vez.';
        if (msg.includes('timed out') || msg.includes('timeout'))
          return 'A API não respondeu. Confirma: backend a correr (run-local.bat), telemóvel na mesma Wi-Fi, e EXPO_PUBLIC_API_URL=http://IP_DO_PC:8000 (ipconfig, adapter Wi-Fi).';
        if (
          msg.includes('Bad Gateway') ||
          msg.includes('502') ||
          msg.includes('Application failed to respond') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('Failed to fetch') ||
          msg.includes('Network request failed')
        )
          return 'Não foi possível ligar à API. Em testes locais: EXPO_PUBLIC_API_URL=http://192.168.x.x:8000 (IP Wi-Fi do PC, não VMware). Backend: .\\run-local.bat';
        return msg;
      }
      return 'Something went wrong.';
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
    return 'Something went wrong. Please try again.';
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
  