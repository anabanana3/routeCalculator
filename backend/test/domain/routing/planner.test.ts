import { beforeAll, describe, expect, it } from 'vitest';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { clampItineraries, noRouteReason, Planner } from '../../../src/domain/routing/planner.js';
import { at } from '../../fixtures/connections.js';
import { buildTestNetwork, near, ROUTING_OPTIONS, stopIdx, STOPS } from '../../fixtures/network.js';

let n: TransitNetwork;
beforeAll(async () => {
  n = await buildTestNetwork();
});

const MONDAY_0755 = at('2026-03-02T07:55:00+01:00');
const from = near(STOPS.A);
const to = near(STOPS.E);

describe('Planner.plan', () => {
  it('devuelve las alternativas ordenadas por llegada', () => {
    const plan = new Planner(n, ROUTING_OPTIONS).plan({ from, to, departureTime: MONDAY_0755 });
    expect(plan.timezone).toBe('Europe/Madrid');
    expect(plan.requestedAt).toBe(MONDAY_0755);
    expect(plan.noRouteReason).toBeUndefined();
    expect(plan.itineraries.map((it) => it.legs.map((l) => l.tripId ?? 'walk'))).toEqual([
      ['walk', 'T1', 'T2', 'walk'],
      ['walk', 'T1b', 'T2b', 'walk'],
    ]);
    const [first, second] = plan.itineraries;
    expect(first.endTime).toBeLessThan(second.endTime);
    expect(new Date(first.legs[1].startTime).toISOString()).toBe('2026-03-02T07:00:00.000Z');
  });

  it('respeta maxItineraries', () => {
    const plan = new Planner(n, ROUTING_OPTIONS).plan({ from, to, departureTime: MONDAY_0755, maxItineraries: 1 });
    expect(plan.itineraries).toHaveLength(1);
  });

  it('añade la opción a pie si el destino está cerca', () => {
    const plan = new Planner(n, ROUTING_OPTIONS).plan({ from, to: near(STOPS.B), departureTime: MONDAY_0755 });
    const walkOnly = plan.itineraries.find((it) => it.legs.length === 1 && it.legs[0].mode === 'WALK');
    expect(walkOnly).toBeDefined();
    expect(walkOnly!.startTime).toBe(MONDAY_0755);
    // Ordenados por hora de llegada.
    const ends = plan.itineraries.map((it) => it.endTime);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
  });

  it('indica que no hay paradas cerca del origen', () => {
    const plan = new Planner(n, ROUTING_OPTIONS).plan({ from: { lat: 0, lon: 0 }, to, departureTime: MONDAY_0755 });
    expect(plan.itineraries).toEqual([]);
    expect(plan.noRouteReason).toBe('NO_STOPS_NEAR_ORIGIN');
  });

  it('indica que no hay paradas cerca del destino', () => {
    const plan = new Planner(n, ROUTING_OPTIONS).plan({ from, to: { lat: 0, lon: 0 }, departureTime: MONDAY_0755 });
    expect(plan.noRouteReason).toBe('NO_STOPS_NEAR_DESTINATION');
  });

  it('indica que no hay ruta si no circula ningún servicio', () => {
    const saturday = at('2026-03-07T07:55:00+01:00');
    const plan = new Planner(n, ROUTING_OPTIONS).plan({ from, to, departureTime: saturday });
    expect(plan.itineraries).toEqual([]);
    expect(plan.noRouteReason).toBe('NO_ROUTE_FOUND');
  });

  it('en modo depuración ignora el calendario', () => {
    const saturday = at('2026-03-07T07:55:00+01:00');
    const plan = new Planner(n, { ...ROUTING_OPTIONS, ignoreServiceCalendar: true }).plan({ from, to, departureTime: saturday });
    expect(plan.itineraries.length).toBeGreaterThan(0);
  });
});

describe('Planner.nearbyStops', () => {
  it('devuelve las paradas a distancia a pie con tiempo estimado', () => {
    const access = new Planner(n, ROUTING_OPTIONS).nearbyStops(near(STOPS.A, 100));
    expect(access.map((a) => a.stop)).toEqual([stopIdx(n, 'A')]);
    expect(access[0].meters).toBe(125);
    expect(access[0].seconds).toBe(100);
  });

  it('amplía el radio al doble si no encuentra ninguna', () => {
    const access = new Planner(n, ROUTING_OPTIONS).nearbyStops(near(STOPS.A, 600));
    expect(access.map((a) => a.stop)).toEqual([stopIdx(n, 'A')]);
  });

  it('devuelve [] si no hay nada ni con el radio ampliado', () => {
    expect(new Planner(n, ROUTING_OPTIONS).nearbyStops(near(STOPS.A, 900))).toEqual([]);
  });
});

describe('clampItineraries', () => {
  it('limita entre 1 y 10', () => {
    expect(clampItineraries(0)).toBe(1);
    expect(clampItineraries(-5)).toBe(1);
    expect(clampItineraries(3)).toBe(3);
    expect(clampItineraries(3.7)).toBe(3);
    expect(clampItineraries(50)).toBe(10);
    expect(clampItineraries(Number.NaN)).toBe(1);
  });
});

describe('noRouteReason', () => {
  it('prioriza origen, después destino', () => {
    expect(noRouteReason(0, 0)).toBe('NO_STOPS_NEAR_ORIGIN');
    expect(noRouteReason(1, 0)).toBe('NO_STOPS_NEAR_DESTINATION');
    expect(noRouteReason(1, 1)).toBe('NO_ROUTE_FOUND');
  });
});
