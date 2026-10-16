import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 429,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof HTTPException) {
    const codes: Record<number, string> = { 400: 'invalid_request', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 413: 'payload_too_large' };
    return c.json({ error: { code: codes[err.status] ?? 'http_error', message: err.status === 400 ? 'Invalid request' : err.message } }, err.status);
  }
  console.error(err);
  return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
};
