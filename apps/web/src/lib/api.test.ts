import { describe, expect, it } from 'vitest';
import { ApiRequestError, unwrap } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('unwrap', () => {
  it('returns the parsed body on success', async () => {
    expect(await unwrap<{ a: number }>(json(200, { a: 1 }))).toEqual({ a: 1 });
  });
  it('returns undefined for 204', async () => {
    expect(await unwrap(new Response(null, { status: 204 }))).toBeUndefined();
  });
  it('throws ApiRequestError with the API error code and message', async () => {
    await expect(unwrap(json(409, { error: { code: 'email_taken', message: 'This email is already registered' } }))).rejects.toMatchObject({
      name: 'ApiRequestError', status: 409, code: 'email_taken', message: 'This email is already registered',
    });
  });
  it('survives a non-JSON error body', async () => {
    const err = (await unwrap(new Response('boom', { status: 502 })).catch((e: unknown) => e)) as ApiRequestError;
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(502);
  });
});
