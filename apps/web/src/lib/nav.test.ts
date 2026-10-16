import { describe, expect, it } from 'vitest';
import { safeNext } from './nav';

describe('safeNext', () => {
  it('accepts same-origin paths', () => {
    expect(safeNext('/people/123?tab=stock')).toBe('/people/123?tab=stock');
    expect(safeNext('/invitations/abc')).toBe('/invitations/abc');
  });
  it('falls back for missing values', () => {
    expect(safeNext(null)).toBe('/today');
    expect(safeNext(undefined)).toBe('/today');
    expect(safeNext('')).toBe('/today');
  });
  it('rejects open-redirect attempts', () => {
    const bad = [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      'javascript:alert(1)',
      'people',
      ' /x',
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r/evil.com',
      '/x /y',
      '/\u0000/evil.com',
      decodeURIComponent('/%09/evil.com'),
      decodeURIComponent('/%0a/evil.com'),
      '/ /evil.com',
    ];
    for (const b of bad) expect(safeNext(b), JSON.stringify(b)).toBe('/today');
  });
});
