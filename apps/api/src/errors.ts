import type { ErrorHandler } from 'hono';

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
  console.error(err);
  return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
};
