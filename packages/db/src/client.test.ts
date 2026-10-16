import { describe, expect, it, vi } from 'vitest';
import { createDb } from './client';

describe('createDb', () => {
  it('survives an idle-client error on the pool and logs one line without credentials', async () => {
    const log = vi.fn();
    const { pool } = createDb('postgres://alice:s3cret-pw@db.invalid:5432/app', log);
    const err = Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' });
    expect(() => pool.emit('error', err)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]![0]);
    expect(line).toContain('57P01');
    expect(line).not.toContain('s3cret-pw');
    expect(line).not.toContain('alice');
    await pool.end();
  });
});
