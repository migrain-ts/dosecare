import { hc } from 'hono/client';
import type { AppType } from '@dosecare/api';

export const api = hc<AppType>('/api');

export class ApiRequestError extends Error {
  override name = 'ApiRequestError';
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function unwrap<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new ApiRequestError(res.status, body?.error?.code ?? 'unknown', body?.error?.message ?? res.statusText ?? 'Request failed');
  return body as T;
}
