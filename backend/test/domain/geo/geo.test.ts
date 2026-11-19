import { describe, expect, it } from 'vitest';
import {
  boundsCenter,
  boundsDiagonalMeters,
  computeBounds,
  expandBounds,
  fastDistanceSq,
  haversineMeters,
  polylineLength,
} from '../../../src/domain/geo/geo.js';

describe('haversineMeters', () => {
  it('es 0 para el mismo punto', () => {
    expect(haversineMeters(40.4, -3.7, 40.4, -3.7)).toBe(0);
  });

  it('un grado de latitud mide unos 111 km', () => {
    expect(haversineMeters(40, -3, 41, -3)).toBeCloseTo(111_195, -1);
  });

  it('es simétrica', () => {
    const a = haversineMeters(40.4, -3.7, 41.38, 2.17);
    const b = haversineMeters(41.38, 2.17, 40.4, -3.7);
    expect(a).toBeCloseTo(b, 6);
    // Madrid - Barcelona en línea recta: ~505 km
    expect(a / 1000).toBeGreaterThan(495);
    expect(a / 1000).toBeLessThan(510);
  });

  it('no devuelve NaN en puntos antipodales', () => {
    expect(haversineMeters(0, 0, 0, 180)).toBeCloseTo(Math.PI * 6371008.8, 0);
  });
});

describe('fastDistanceSq', () => {
  it('ordena las distancias igual que haversine en distancias cortas', () => {
    const near = fastDistanceSq(40.4, -3.7, 40.401, -3.7);
    const far = fastDistanceSq(40.4, -3.7, 40.41, -3.7);
    expect(near).toBeLessThan(far);
    expect(fastDistanceSq(40.4, -3.7, 40.4, -3.7)).toBe(0);
  });

  it('corrige la longitud por la latitud', () => {
    // A 60º de latitud un grado de longitud "vale" la mitad que uno de latitud.
    expect(fastDistanceSq(60, 0, 60, 1)).toBeCloseTo(0.25, 2);
  });
});

describe('polylineLength', () => {
  it('suma los segmentos', () => {
    const coords: [number, number][] = [
      [40, -3],
      [40.5, -3],
      [41, -3],
    ];
    expect(polylineLength(coords)).toBeCloseTo(haversineMeters(40, -3, 41, -3), 3);
  });

  it('es 0 con menos de dos puntos', () => {
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([[40, -3]])).toBe(0);
  });
});

describe('computeBounds', () => {
  it('devuelve null sin puntos', () => {
    expect(computeBounds([])).toBeNull();
  });

  it('calcula los límites', () => {
    expect(
      computeBounds([
        { lat: 40.4, lon: -3.7 },
        { lat: 40.5, lon: -3.6 },
        { lat: 40.3, lon: -3.8 },
      ]),
    ).toEqual({ minLat: 40.3, minLon: -3.8, maxLat: 40.5, maxLon: -3.6 });
  });

  it('acepta cualquier iterable', () => {
    function* gen() {
      yield { lat: 1, lon: 2 };
    }
    expect(computeBounds(gen())).toEqual({ minLat: 1, minLon: 2, maxLat: 1, maxLon: 2 });
  });
});

describe('boundsCenter / expandBounds / boundsDiagonalMeters', () => {
  const b = { minLat: 40, minLon: -4, maxLat: 41, maxLon: -3 };

  it('calcula el centro', () => {
    expect(boundsCenter(b)).toEqual({ lat: 40.5, lon: -3.5 });
  });

  it('amplía con un margen en metros', () => {
    const e = expandBounds(b, 1113.2);
    expect(e.minLat).toBeCloseTo(39.99, 4);
    expect(e.maxLat).toBeCloseTo(41.01, 4);
    // La longitud se amplía más que la latitud (cos(40.5º) < 1).
    expect(b.minLon - e.minLon).toBeGreaterThan(0.01);
    expect(e.maxLon - b.maxLon).toBeCloseTo(b.minLon - e.minLon, 10);
  });

  it('expandBounds con margen 0 no cambia nada', () => {
    expect(expandBounds(b, 0)).toEqual(b);
  });

  it('mide la diagonal', () => {
    expect(boundsDiagonalMeters(b)).toBeCloseTo(haversineMeters(40, -4, 41, -3), 6);
  });
});
