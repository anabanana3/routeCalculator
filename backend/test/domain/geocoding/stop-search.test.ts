import { beforeAll, describe, expect, it } from 'vitest';
import { StopSearchIndex } from '../../../src/domain/geocoding/stop-search.js';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { buildTestNetwork, near, STOPS } from '../../fixtures/network.js';

let index: StopSearchIndex;
beforeAll(async () => {
  const n: TransitNetwork = await buildTestNetwork();
  index = new StopSearchIndex(n);
});

describe('StopSearchIndex.search', () => {
  it('busca por nombre sin acentos ni mayúsculas', () => {
    expect(index.search('estacion', 5)).toEqual([
      { label: 'Estación Central', secondary: 'Parada 103', lat: 40.4, lon: -3.69, kind: 'stop' },
    ]);
  });

  it('busca por código de parada', () => {
    expect(index.search('104', 5).map((r) => r.label)).toEqual(['Hospital']);
  });

  it('no devuelve paradas finales sin salidas', () => {
    // Universidad (105) solo es final de línea.
    expect(index.search('105', 5)).toEqual([]);
  });

  it('exige todas las palabras', () => {
    expect(index.search('plaza mayor', 5).map((r) => r.label)).toEqual(['Plaza Mayor']);
    expect(index.search('plaza universidad', 5)).toEqual([]);
  });

  it('paradas sin código se muestran como "Parada"', () => {
    expect(index.search('mercado', 5)[0].secondary).toBe('Parada');
  });

  it('no devuelve paradas sin servicio', () => {
    expect(index.search('sin servicio', 5)).toEqual([]);
  });

  it('respeta el límite', () => {
    // "a" aparece en casi todas las paradas.
    expect(index.search('a', 2)).toHaveLength(2);
    expect(index.search('a', 0)).toEqual([]);
  });

  it('consultas vacías o solo con signos no devuelven nada', () => {
    expect(index.search('', 5)).toEqual([]);
    expect(index.search(' ?! ', 5)).toEqual([]);
  });
});

describe('StopSearchIndex.nearest', () => {
  it('devuelve la parada cercana con las coordenadas del punto', () => {
    const p = near(STOPS.D, 10);
    expect(index.nearest(p, 25)).toEqual({ label: 'Hospital', secondary: 'Parada 104', lat: p.lat, lon: p.lon, kind: 'stop' });
  });

  it('null si no hay ninguna a esa distancia', () => {
    expect(index.nearest(near(STOPS.D, 100), 25)).toBeNull();
  });
});
