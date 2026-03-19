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
          return 'Connection failed. Check your network and try again.';
        if (msg.includes('Bad Gateway') || msg.includes('502') || msg.includes('ECONNREFUSED'))
          return 'The API server is not running. Start the backend: open a terminal, run .\\start.bat from the project folder, or run .\\run.bat inside the backend folder.';
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
  