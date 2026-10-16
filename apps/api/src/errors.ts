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
  console.error(safeSummary(err));
  return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
};

// Driver errors (e.g. Drizzle's "Failed query: ... params: ...") embed query parameters such as emails and password
// hashes in their message, so the message of the thrown error is never logged. The pg error in `cause` carries a
// code and a server message without parameter values; only the stack frame lines (`    at ...`) are kept.
function safeSummary(err: Error): string {
  const parts = [`[api] unhandled ${err.name}`];
  const cause = err.cause as { code?: unknown; message?: unknown } | undefined;
  if (cause && typeof cause === 'object') parts.push(`cause: ${String(cause.code ?? '')} ${String(cause.message ?? '')}`.trim());
  const frames = err.stack
    ?.split('\n')
    .filter((l) => /^\s+at /.test(l))
    .join('\n');
  return frames ? `${parts.join(' ')}\n${frames}` : parts.join(' ');
}
