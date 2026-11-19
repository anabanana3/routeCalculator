import { beforeAll, describe, expect, it } from 'vitest';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { nearestIndex, tripLegGeometry } from '../../../src/domain/routing/geometry.js';
import { buildTestNetwork, tripIdx } from '../../fixtures/network.js';

let n: TransitNetwork;
beforeAll(async () => {
  n = await buildTestNetwork();
});

const trip = (id: string) => n.trips[tripIdx(n, id)];

describe('nearestIndex', () => {
  it('devuelve el punto de la shape más cercano a partir de una posición', () => {
    const s1 = n.shapes.get('S1')!;
    expect(nearestIndex(s1, 40.4, -3.695, 0)).toBe(2);
    expect(nearestIndex(s1, 40.4, -3.7, 0)).toBe(0);
    // Desde la posición 3 en adelante no se puede volver atrás.
    expect(nearestIndex(s1, 40.4, -3.7, 3)).toBe(3);
    expect(nearestIndex(s1, 40.4, -3.69, 0)).toBe(4);
  });
});

describe('tripLegGeometry', () => {
  it('recorta la shape por shape_dist_traveled', () => {
    expect(tripLegGeometry(n, trip('T1'), 0, 2)).toEqual([
      [40.4, -3.7],
      [40.4005, -3.6975],
      [40.4, -3.695],
      [40.4005, -3.6925],
      [40.4, -3.69],
    ]);
    expect(tripLegGeometry(n, trip('T1'), 0, 1)).toEqual([
      [40.4, -3.7],
      [40.4005, -3.6975],
      [40.4, -3.695],
    ]);
  });

  it('sin distancias recorre la shape por proximidad a las paradas', () => {
    // T1b usa la shape S1 pero sus stop_times no tienen shape_dist_traveled.
    expect(tripLegGeometry(n, trip('T1b'), 1, 2)).toEqual([
      [40.4, -3.695],
      [40.4, -3.695],
      [40.4005, -3.6925],
      [40.4, -3.69],
      [40.4, -3.69],
    ]);
  });

  it('sin shape une las paradas en línea recta', () => {
    expect(tripLegGeometry(n, trip('T2'), 0, 2)).toEqual([
      [40.4, -3.69],
      [40.405, -3.69],
      [40.41, -3.69],
    ]);
  });

  it('ignora shapes con menos de dos puntos', () => {
    const t = { ...trip('T1'), shapeId: 'ONE' };
    const network = { ...n, shapes: new Map([['ONE', { lat: Float64Array.of(1), lon: Float64Array.of(1), dist: null }]]) };
    expect(tripLegGeometry(network, t, 0, 1)).toEqual([
      [40.4, -3.7],
      [40.4, -3.695],
    ]);
  });
});
