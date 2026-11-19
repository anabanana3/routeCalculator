import { describe, expect, it } from 'vitest';
import { removeDominated } from '../../../src/domain/routing/dominance.js';
import type { Itinerary, Leg } from '../../../src/domain/routing/itinerary.js';

const MIN = 60_000;

function itinerary(start: number, end: number, transfers: number, tripIds: string[]): Itinerary {
  const legs = tripIds.map(
    (tripId, i) =>
      ({
        mode: 'BUS',
        from: { name: `S${i}`, lat: 0, lon: 0, stopId: `S${i}` },
        to: { name: `S${i + 1}`, lat: 0, lon: 0 },
        startTime: start,
        endTime: end,
        durationSeconds: 0,
        distanceMeters: 0,
        geometry: [],
        tripId,
      }) satisfies Leg,
  );
  return {
    startTime: start,
    endTime: end,
    durationSeconds: (end - start) / 1000,
    walkingSeconds: 0,
    walkingDistanceMeters: 0,
    waitingSeconds: 0,
    transfers,
    legs,
  };
}

describe('removeDominated', () => {
  it('elimina duplicados (mismos viajes y paradas)', () => {
    const a = itinerary(0, 10 * MIN, 0, ['T1']);
    const b = itinerary(0, 10 * MIN, 0, ['T1']);
    expect(removeDominated([a, b])).toEqual([a]);
  });

  it('elimina un itinerario que sale antes y llega igual o más tarde', () => {
    const early = itinerary(0, 20 * MIN, 0, ['T1']);
    const late = itinerary(5 * MIN, 20 * MIN, 0, ['T2']);
    expect(removeDominated([early, late])).toEqual([late]);
  });

  it('elimina el que llega más tarde saliendo a la vez', () => {
    const slow = itinerary(0, 30 * MIN, 0, ['T1']);
    const fast = itinerary(0, 20 * MIN, 0, ['T2']);
    expect(removeDominated([slow, fast])).toEqual([fast]);
  });

  it('con mismos horarios gana el de menos transbordos', () => {
    const one = itinerary(0, 20 * MIN, 1, ['T1', 'T2']);
    const zero = itinerary(0, 20 * MIN, 0, ['T3']);
    expect(removeDominated([one, zero])).toEqual([zero]);
  });

  it('conserva alternativas más rápidas pero con más transbordos', () => {
    const direct = itinerary(0, 30 * MIN, 0, ['T1']);
    const faster = itinerary(0, 20 * MIN, 1, ['T2', 'T3']);
    expect(removeDominated([direct, faster])).toEqual([direct, faster]);
  });

  it('conserva itinerarios que no se solapan', () => {
    const a = itinerary(0, 10 * MIN, 0, ['T1']);
    const b = itinerary(15 * MIN, 25 * MIN, 0, ['T2']);
    expect(removeDominated([a, b])).toEqual([a, b]);
  });

  it('lista vacía', () => {
    expect(removeDominated([])).toEqual([]);
  });
});
