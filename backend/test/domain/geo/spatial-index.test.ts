import { describe, expect, it } from 'vitest';
import { haversineMeters } from '../../../src/domain/geo/geo.js';
import { SpatialIndex } from '../../../src/domain/geo/spatial-index.js';

const points = [
  { idx: 0, lat: 40.4, lon: -3.7 },
  { idx: 1, lat: 40.4, lon: -3.695 }, // ~424 m al este
  { idx: 2, lat: 40.4009, lon: -3.7 }, // ~100 m al norte
  { idx: 3, lat: 41.4, lon: 2.17 }, // otra ciudad
];

describe('SpatialIndex', () => {
  const index = new SpatialIndex(points);

  it('devuelve los puntos dentro del radio ordenados por distancia', () => {
    const found = index.within(40.4, -3.7, 500);
    expect(found.map((r) => r.idx)).toEqual([0, 2, 1]);
    expect(found[0].meters).toBe(0);
    expect(found[1].meters).toBeCloseTo(haversineMeters(40.4, -3.7, 40.4009, -3.7), 6);
  });

  it('excluye los puntos fuera del radio', () => {
    expect(index.within(40.4, -3.7, 200).map((r) => r.idx)).toEqual([0, 2]);
    expect(index.within(40.4, -3.7, 0).map((r) => r.idx)).toEqual([0]);
  });

  it('encuentra puntos en celdas vecinas', () => {
    // Celdas de 0,001º: los puntos quedan en celdas distintas.
    const fine = new SpatialIndex(points, 0.001);
    expect(fine.within(40.4, -3.7, 500).map((r) => r.idx)).toEqual([0, 2, 1]);
  });

  it('no encuentra nada en zonas vacías', () => {
    expect(index.within(0, 0, 1000)).toEqual([]);
    expect(new SpatialIndex([]).within(40.4, -3.7, 1000)).toEqual([]);
  });

  it('funciona cerca de los polos sin dividir por cero', () => {
    const polar = new SpatialIndex([{ idx: 9, lat: 89.9999, lon: 10 }]);
    expect(polar.within(89.9999, 10, 10).map((r) => r.idx)).toEqual([9]);
  });
});
