import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ProdutoCriarFormDraft } from '@/utils/mapCaptureJobToForm';

const KEY = 'pharmacy_product_capture_draft';

export type ProductCaptureDraft = {
  form: Partial<ProdutoCriarFormDraft>;
  needsReview: boolean;
  overallConfidence: number | null;
  ocrPreview: string | null;
  createdAt: string;
};

export async function saveCaptureDraft(draft: ProductCaptureDraft): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(draft));
}

export async function loadCaptureDraft(): Promise<ProductCaptureDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ProductCaptureDraft;
  } catch {
    return null;
  }
}

export async function clearCaptureDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
