import { describe, expect, it } from 'vitest';
import { canRecord, formatLocalTime, localDateChanged, statusMeta, todayRange, viewState } from './dose';

describe('dose helpers', () => {
  it('only owners and editors can record', () => {
    expect([canRecord('owner'), canRecord('editor'), canRecord('viewer')]).toEqual([true, true, false]);
  });
  it('status labels and colours', () => {
    expect(statusMeta('taken')).toEqual({ label: 'Taken', color: 'success' });
    expect(statusMeta('missed')).toEqual({ label: 'Missed', color: 'error' });
    expect(statusMeta('skipped').color).toBe('warning');
    expect(statusMeta('pending').color).toBe('default');
  });
  it('formats times in the person time zone', () => {
    expect(formatLocalTime('2026-01-05T07:00:00.000Z', 'Europe/Paris')).toBe('08:00');
    expect(formatLocalTime('2026-01-05T07:00:00.000Z', 'America/New_York')).toBe('02:00');
  });
  it('today is the local date of the person, not the viewer', () => {
    expect(todayRange(new Date('2026-01-05T23:30:00Z'), 'Europe/Paris')).toEqual({ from: '2026-01-06', to: '2026-01-06' });
    expect(todayRange(new Date('2026-01-05T23:30:00Z'), 'America/New_York')).toEqual({ from: '2026-01-05', to: '2026-01-05' });
  });
  it('viewState: loading, error, empty, list', () => {
    expect(viewState({ isLoading: true, isError: false })).toBe('loading');
    expect(viewState({ isLoading: false, isError: true })).toBe('error');
    expect(viewState({ isLoading: false, isError: false, data: [] })).toBe('empty');
    expect(viewState({ isLoading: false, isError: false, data: [1] })).toBe('list');
  });
  it('viewState: a failed refetch with stale data keeps the list; no data and no error is loading', () => {
    expect(viewState({ isLoading: false, isError: true, data: [1] })).toBe('list');
    expect(viewState({ isLoading: false, isError: true, data: [] })).toBe('empty');
    expect(viewState({ isLoading: false, isError: false })).toBe('loading');
  });
  it('detects a local date change in the person zone', () => {
    const a = new Date('2026-01-05T22:59:00Z');
    const b = new Date('2026-01-05T23:01:00Z');
    expect(localDateChanged(a, b, 'Europe/Paris')).toBe(true);
    expect(localDateChanged(a, b, 'America/New_York')).toBe(false);
  });
});
