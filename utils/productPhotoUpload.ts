import { Platform } from 'react-native';

import { getApiBaseUrl, getStoredToken } from '@/services/api';
import type { Product } from '@/types';

function fileExtension(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
}

async function appendPhotoFile(form: FormData, uri: string, mimeType: string): Promise<void> {
  const ext = fileExtension(mimeType);
  const filename = `product.${ext}`;
  const normalizedMime =
    mimeType && mimeType !== 'application/octet-stream' ? mimeType : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    if (!res.ok) throw new Error('Não foi possível ler a imagem selecionada.');
    const blob = await res.blob();
    const type =
      blob.type && blob.type !== 'application/octet-stream' ? blob.type : normalizedMime;
    form.append('file', new File([blob], filename, { type }));
    return;
  }

  form.append('file', {
    uri,
    name: filename,
    type: normalizedMime,
  } as unknown as Blob);
}

async function parseUploadError(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({ detail: res.statusText }));
  const detail = (err as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  return res.status >= 500 ? 'Erro no servidor.' : 'Pedido falhou.';
}

/** Envia fotografia directamente para a API (sem AI, OCR ou ChatGPT). */
export async function uploadProductPhotoDirect(
  productId: number,
  uri: string,
  mimeType = 'image/jpeg',
  onStatus?: (text: string) => void,
): Promise<Product> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('API não configurada (EXPO_PUBLIC_API_URL).');

  onStatus?.('A guardar fotografia…');
  const token = await getStoredToken();
  const form = new FormData();
  await appendPhotoFile(form, uri, mimeType);

  const res = await fetch(`${base}/products/${productId}/photo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(await parseUploadError(res));
  return res.json() as Promise<Product>;
}
