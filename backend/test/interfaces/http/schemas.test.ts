import { describe, expect, it } from 'vitest';
import { describeIssues, planSchema, reverseSchema, searchSchema } from '../../../src/interfaces/http/schemas.js';

const p = { lat: 40.4, lon: -3.7 };

describe('planSchema', () => {
  it('acepta peticiones válidas', () => {
    expect(planSchema.parse({ from: p, to: p })).toEqual({ from: p, to: p });
    expect(planSchema.parse({ from: p, to: p, dateTime: '2026-03-02T08:00:00+01:00', maxItineraries: 5 }).maxItineraries).toBe(5);
    expect(planSchema.parse({ from: p, to: p, dateTime: '2026-03-02T07:00:00Z' }).dateTime).toBe('2026-03-02T07:00:00Z');
  });

  it.each([
    [{ to: p }],
    [{ from: { lat: 91, lon: 0 }, to: p }],
    [{ from: { lat: 0, lon: 181 }, to: p }],
    [{ from: { lat: '40', lon: 0 }, to: p }],
    [{ from: p, to: p, dateTime: 'mañana' }],
    [{ from: p, to: p, dateTime: '2026-03-02' }],
    [{ from: p, to: p, maxItineraries: 11 }],
    [{ from: p, to: p, maxItineraries: 1.5 }],
    [{ from: { lat: Number.NaN, lon: 0 }, to: p }],
  ])('rechaza %o', (body) => {
    expect(planSchema.safeParse(body).success).toBe(false);
  });
});

describe('searchSchema', () => {
  it('convierte la query y aplica valores por defecto', () => {
    expect(searchSchema.parse({ q: '  sol  ' })).toEqual({ q: 'sol', limit: 6 });
    expect(searchSchema.parse({ q: 'sol', limit: '3', lat: '40.4', lon: '-3.7' })).toEqual({ q: 'sol', limit: 3, lat: 40.4, lon: -3.7 });
  });

  it.each([
    [{}],
    [{ q: 'a' }],
    [{ q: 'x'.repeat(201) }],
    [{ q: ['a', 'b'] }],
    [{ q: 'sol', limit: '0' }],
    [{ q: 'sol', limit: '11' }],
    [{ q: 'sol', lat: '100' }],
  ])('rechaza %o', (query) => {
    expect(searchSchema.safeParse(query).success).toBe(false);
  });
});

describe('reverseSchema', () => {
  it('convierte coordenadas', () => {
    expect(reverseSchema.parse({ lat: '40.4', lon: '-3.7' })).toEqual(p);
  });

  it('rechaza coordenadas ausentes o fuera de rango', () => {
    expect(reverseSchema.safeParse({ lat: '40' }).success).toBe(false);
    expect(reverseSchema.safeParse({ lat: '-91', lon: '0' }).success).toBe(false);
    expect(reverseSchema.safeParse({ lat: 'abc', lon: '0' }).success).toBe(false);
  });
});

describe('describeIssues', () => {
  it('devuelve ruta y mensaje sin repetir el valor recibido', () => {
    const r = planSchema.safeParse({ from: { lat: 'SECRETO', lon: 0 }, to: p });
    expect(r.success).toBe(false);
    const issues = describeIssues(r.error!);
    expect(issues).toEqual([{ path: 'from.lat', message: expect.any(String) }]);
    expect(JSON.stringify(issues)).not.toContain('SECRETO');
  });
});
