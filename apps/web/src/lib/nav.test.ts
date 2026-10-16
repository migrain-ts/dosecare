import { describe, expect, it } from 'vitest';
import { safeNext } from './nav';

describe('safeNext', () => {
  it('accepts same-origin paths', () => {
    expect(safeNext('/people/123?tab=stock')).toBe('/people/123?tab=stock');
  });
  it('falls back for missing values', () => {
    expect(safeNext(null)).toBe('/today');
    expect(safeNext(undefined)).toBe('/today');
    expect(safeNext('')).toBe('/today');
  });
  it('rejects open-redirect attempts', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', 'people', ' /x']) {
      expect(safeNext(bad), bad).toBe('/today');
    }
  });
});
