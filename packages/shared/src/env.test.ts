import { describe, expect, it } from 'vitest';
import { numberFromEnv } from './env';

describe('numberFromEnv', () => {
  it('parses a valid number', () => {
    expect(numberFromEnv('10', 30)).toBe(10);
    expect(numberFromEnv('4001', 4000)).toBe(4001);
  });
  it('falls back for a missing, empty or non-numeric value', () => {
    for (const raw of [undefined, '', '  ', 'abc', 'NaN', 'Infinity']) expect(numberFromEnv(raw, 30), String(raw)).toBe(30);
  });
  it('clamps to the lower bound (default 1)', () => {
    expect(numberFromEnv('0', 30)).toBe(1);
    expect(numberFromEnv('-5', 30)).toBe(1);
    expect(numberFromEnv('0.2', 30, 1)).toBe(1);
  });
});
