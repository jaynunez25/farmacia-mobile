import type { CaptureJob } from '@/services/aiCapture';
import { createCaptureJobFromUri, getCaptureJob } from '@/services/aiCapture';
import { getApiBaseUrl, getStoredToken } from '@/services/api';
import type { Product } from '@/types';

export function imagePathsFromCaptureJob(job: CaptureJob): {
  image_url: string;
  thumbnail_url: string;
} | null {
  const image = (job.cleaned_image_path ?? '').trim();
  const thumb = (job.thumbnail_path ?? '').trim();
  if (!image && !thumb) return null;
  return {
    image_url: image || thumb,
    thumbnail_url: thumb || image,
  };
}

export async function attachCaptureJobPhotoToProduct(
  jobId: number,
  productId: number,
): Promise<Product> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('API não configurada (EXPO_PUBLIC_API_URL).');
  const token = await getStoredToken();
  const res = await fetch(`${base}/products/${productId}/photo/from-capture-job/${jobId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = (err as { detail?: unknown }).detail;
    throw new Error(typeof detail === 'string' ? detail : 'Não foi possível guardar a foto da captura.');
  }
  return res.json() as Promise<Product>;
}

/** Grava imagem da Captura AI na BD (bytes), não só URL /products/images/ no disco. */
export async function applyCaptureJobImagesToProduct(
  job: CaptureJob,
  productId: number,
): Promise<Product> {
  return attachCaptureJobPhotoToProduct(job.id, productId);
}

export async function pollCaptureJobUntilDone(
  jobId: number,
  onStatus?: (text: string) => void,
  intervalMs = 700,
): Promise<CaptureJob> {
  const poll = async (): Promise<CaptureJob> => {
    const job = await getCaptureJob(jobId);
    if (job.status === 'processing') {
      onStatus?.('A preparar imagem POS e a ler embalagem…');
    }
    if (job.status === 'completed') return job;
    if (job.status === 'failed') {
      throw new Error(job.error_message || 'Processamento da imagem falhou.');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    return poll();
  };
  onStatus?.('A enviar imagem…');
  return poll();
}

/** Foto → job AI (fundo branco + thumbnail) → PATCH no produto existente. */
export async function uploadProductPhotoFromUri(
  productId: number,
  uri: string,
  mimeType = 'image/jpeg',
  onStatus?: (text: string) => void,
): Promise<Product> {
  const { job_id } = await createCaptureJobFromUri(uri, mimeType);
  onStatus?.('A processar fotografia…');
  const job = await pollCaptureJobUntilDone(job_id, onStatus);
  return applyCaptureJobImagesToProduct(job, productId);
}
