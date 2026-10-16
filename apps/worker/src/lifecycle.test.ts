import { describe, expect, it, vi } from 'vitest';
import { createLifecycle } from './lifecycle';

function setup(cycle: () => Promise<unknown>) {
  const pool = { end: vi.fn(async () => {}) };
  const lc = createLifecycle({ pool, cycle, everyMs: 10_000, log: () => {}, logError: () => {} });
  return { pool, lc };
}
const flush = () => new Promise((r) => setImmediate(r));

describe('createLifecycle', () => {
  it('ends the pool once on repeated stop() while idle', async () => {
    const { pool, lc } = setup(async () => ({}));
    lc.start();
    await flush();
    await Promise.all([lc.stop(), lc.stop()]);
    await lc.stop();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('waits for a running cycle, then ends the pool once', async () => {
    let release!: () => void;
    const { pool, lc } = setup(() => new Promise<void>((r) => (release = r)));
    lc.start();
    await flush();
    const stopped = Promise.all([lc.stop(), lc.stop()]);
    await flush();
    expect(pool.end).not.toHaveBeenCalled();
    release();
    await stopped;
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('keeps looping after a failing cycle and survives a failing pool.end', async () => {
    vi.useFakeTimers();
    const cycle = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({});
    const pool = { end: vi.fn().mockRejectedValue(new Error('end failed')) };
    const lc = createLifecycle({ pool, cycle, everyMs: 1000, log: () => {}, logError: () => {} });
    lc.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(cycle).toHaveBeenCalledTimes(2);
    await expect(lc.stop()).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
