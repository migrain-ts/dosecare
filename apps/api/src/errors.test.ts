import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from './errors';

afterEach(() => {
  vi.restoreAllMocks();
});

function captureConsoleError() {
  const lines: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? `${a.stack}\n${String((a as { cause?: unknown }).cause)}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  });
  return lines;
}

describe('errorHandler (500)', () => {
  it('never logs query parameters embedded in a driver error message', async () => {
    const lines = captureConsoleError();
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), { code: '23505' });
    const app = new Hono().onError(errorHandler).get('/boom', () => {
      throw Object.assign(new Error('Failed query: insert into "users" values ($1, $2)\nparams: ada@example.com,hunter2-hash'), {
        name: 'DrizzleQueryError',
        cause,
      });
    });
    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 'internal', message: 'Internal error' } });
    const out = lines.join('\n');
    expect(out).not.toContain('hunter2-hash');
    expect(out).not.toContain('ada@example.com');
    expect(out).toContain('DrizzleQueryError');
    expect(out).toContain('23505');
    expect(out).toContain('duplicate key value');
  });

  it('does not log the message of an error without a cause', async () => {
    const lines = captureConsoleError();
    const app = new Hono().onError(errorHandler).get('/boom', () => {
      throw new TypeError('params: hunter2-hash');
    });
    expect((await app.request('/boom')).status).toBe(500);
    const out = lines.join('\n');
    expect(out).not.toContain('hunter2-hash');
    expect(out).toContain('TypeError');
  });
});
