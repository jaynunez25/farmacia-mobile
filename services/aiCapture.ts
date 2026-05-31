import { getApiBaseUrl, getStoredToken } from '@/services/api';

export type CaptureJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'confirmed'
  | 'cancelled';

export interface ExtractedField {
  field_key: string;
  suggested_value: string | null;
  confidence: number | null;
  source: string;
  raw_evidence: string | null;
}

export interface CaptureJob {
  id: number;
  status: CaptureJobStatus;
  needs_review: boolean;
  overall_confidence: number | null;
  cleaned_image_path: string | null;
  thumbnail_path: string | null;
  ocr_raw_text: string | null;
  error_message: string | null;
  fields: ExtractedField[];
  packaging_hints: Record<string, unknown>;
  product_id: number | null;
  created_at: string;
  completed_at: string | null;
}

async function parseError(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({ detail: res.statusText }));
  const detail = (err as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  return res.status >= 500 ? 'Erro no servidor.' : 'Pedido falhou.';
}

export async function createCaptureJobFromUri(
  uri: string,
  mimeType = 'image/jpeg',
): Promise<{ job_id: number; status: string }> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('API não configurada (EXPO_PUBLIC_API_URL).');

  const token = await getStoredToken();
  const form = new FormData();
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  form.append('file', {
    uri,
    name: `capture.${ext}`,
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(`${base}/ai-capture/jobs`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function getCaptureJob(jobId: number): Promise<CaptureJob> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('API não configurada (EXPO_PUBLIC_API_URL).');

  const token = await getStoredToken();
  const res = await fetch(`${base}/ai-capture/jobs/${jobId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function resolveApiMediaUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const s = path.trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = getApiBaseUrl().replace(/\/+$/, '');
  return `${base}${s.startsWith('/') ? s : `/${s}`}`;
}
