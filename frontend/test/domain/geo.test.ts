import { describe, expect, it } from 'vitest';
import { boundsOf, itinerariesGeometry, pointBounds, sameLocation } from '../../src/domain/geo';
import { TRANSIT_ITINERARY, WALK_ITINERARY } from '../fixtures';

describe('boundsOf', () => {
  it('calcula la caja que contiene todos los puntos', () => {
    expect(
      boundsOf([
        [40.4, -3.7],
        [40.5, -3.8],
        [40.45, -3.6],
      ]),
    ).toEqual([
      [40.4, -3.8],
      [40.5, -3.6],
    ]);
  });

  it('un solo punto', () => {
    expect(boundsOf([[1, 2]])).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });
});

describe('pointBounds', () => {
  it('caja degenerada en el punto', () => {
    expect(pointBounds({ lat: 1, lon: 2 })).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });
});

describe('itinerariesGeometry', () => {
  it('concatena las geometrías de todos los tramos', () => {
    const all = itinerariesGeometry([TRANSIT_ITINERARY, WALK_ITINERARY]);
    expect(all).toHaveLength(2 + 3 + 2 + 2);
    expect(all[0]).toEqual([40.4, -3.7]);
  });

  it('lista vacía', () => {
    expect(itinerariesGeometry([])).toEqual([]);
  });
});

describe('sameLocation', () => {
  it('compara coordenadas exactas', () => {
    expect(sameLocation({ lat: 1, lon: 2 }, { lat: 1, lon: 2 })).toBe(true);
    expect(sameLocation({ lat: 1, lon: 2 }, { lat: 1, lon: 2.0001 })).toBe(false);
    expect(sameLocation(null, { lat: 1, lon: 2 })).toBe(false);
    expect(sameLocation(undefined, { lat: 1, lon: 2 })).toBe(false);
  });
});
