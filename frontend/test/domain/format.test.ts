import { describe, expect, it } from 'vitest';
import {
  formatCoords,
  formatDistance,
  formatDuration,
  formatRelative,
  formatTime,
  formatTransfers,
  toDateTimeLocalValue,
} from '../../src/domain/format';
import { NOW, TZ } from '../fixtures';

describe('formatTime', () => {
  it('formatea HH:MM en la zona horaria indicada', () => {
    expect(formatTime('2026-03-02T07:05:00Z', TZ)).toBe('08:05');
    expect(formatTime('2026-07-27T07:05:00Z', TZ)).toBe('09:05');
    expect(formatTime('2026-03-02T07:05:00Z', 'UTC')).toBe('07:05');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '1 min'],
    [29, '1 min'],
    [90, '2 min'],
    [59 * 60, '59 min'],
    [60 * 60, '1 h'],
    [75 * 60, '1 h 15 min'],
    [150 * 60, '2 h 30 min'],
  ])('%i s -> %s', (s, text) => {
    expect(formatDuration(s)).toBe(text);
  });
});

describe('formatDistance', () => {
  it.each([
    [0, '0 m'],
    [44, '40 m'],
    [995, '1000 m'],
    [1000, '1.0 km'],
    [2345, '2.3 km'],
  ])('%i m -> %s', (m, text) => {
    expect(formatDistance(m)).toBe(text);
  });
});

describe('formatCoords', () => {
  it('cinco decimales', () => {
    expect(formatCoords({ lat: 40.123456789, lon: -3.1 })).toBe('40.12346, -3.10000');
  });
});

describe('formatRelative', () => {
  const at = (min: number) => new Date(NOW + min * 60_000).toISOString();
  it('ahora, en N min, a las HH:MM y hace N min', () => {
    expect(formatRelative(at(0), NOW, TZ)).toBe('ahora');
    expect(formatRelative(at(0.4), NOW, TZ)).toBe('ahora');
    expect(formatRelative(at(5), NOW, TZ)).toBe('en 5 min');
    expect(formatRelative(at(59), NOW, TZ)).toBe('en 59 min');
    expect(formatRelative(at(60), NOW, TZ)).toBe('a las 09:00');
    expect(formatRelative(at(-3), NOW, TZ)).toBe('hace 3 min');
  });
});

describe('toDateTimeLocalValue', () => {
  it('usa la hora local del navegador con ceros a la izquierda', () => {
    expect(toDateTimeLocalValue(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03');
    expect(toDateTimeLocalValue(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31T23:59');
  });
});

describe('formatTransfers', () => {
  it('singular y plural', () => {
    expect(formatTransfers(1)).toBe('1 transbordo');
    expect(formatTransfers(2)).toBe('2 transbordos');
  });
});
