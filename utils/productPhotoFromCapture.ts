import type { CaptureJob } from '@/services/aiCapture';
import { createCaptureJobFromUri, getCaptureJob } from '@/services/aiCapture';
import { api } from '@/services/api';
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

export async function applyCaptureJobImagesToProduct(
  job: CaptureJob,
  productId: number,
): Promise<Product> {
  const paths = imagePathsFromCaptureJob(job);
  if (!paths) throw new Error('A imagem ainda não está pronta. Tenta outra fotografia.');
  return api.products.update(productId, paths);
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
