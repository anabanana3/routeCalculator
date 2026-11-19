import { beforeAll, describe, expect, it } from 'vitest';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import type { RawJourney } from '../../../src/domain/routing/csa.js';
import { ItineraryAssembler, type QueryContext, stopPlace } from '../../../src/domain/routing/itinerary-assembler.js';
import { ServiceCalendar } from '../../../src/domain/routing/service-calendar.js';
import { addDays, parseGtfsTime, serviceDayBaseEpoch } from '../../../src/domain/time/service-time.js';
import { at, connOf } from '../../fixtures/connections.js';
import { buildTestNetwork, stopIdx, STOPS } from '../../fixtures/network.js';

let n: TransitNetwork;
let assembler: ItineraryAssembler;
let ctx: QueryContext;

const DATE = '20260302';
const from = { lat: 40.4, lon: -3.7002 };
const to = { lat: 40.4102, lon: -3.69 };

beforeAll(async () => {
  n = await buildTestNetwork();
  assembler = new ItineraryAssembler(n);
  const cal = new ServiceCalendar(n.services);
  ctx = {
    base: serviceDayBaseEpoch(DATE, n.timezone),
    actives: [cal.activeOn(addDays(DATE, -1)), cal.activeOn(DATE), cal.activeOn(addDays(DATE, 1))],
  };
});

function journey(): RawJourney {
  return {
    arrival: parseGtfsTime('08:25:16'),
    legs: [
      { kind: 'access', toStop: stopIdx(n, 'A'), seconds: 16, meters: 20 },
      { kind: 'transit', board: connOf(n, 'T1', 0), alight: connOf(n, 'T1', 1), shift: 0 },
      { kind: 'transit', board: connOf(n, 'T2', 0), alight: connOf(n, 'T2', 1), shift: 0 },
      { kind: 'egress', fromStop: stopIdx(n, 'E'), seconds: 16, meters: 20 },
    ],
  };
}

describe('ItineraryAssembler.fromJourney', () => {
  it('construye los tramos con horas, paradas y líneas', () => {
    const it = assembler.fromJourney(journey(), from, to, ctx);
    expect(it.legs.map((l) => l.mode)).toEqual(['WALK', 'BUS', 'TRAM', 'WALK']);
    expect(it.startTime).toBe(at('2026-03-02T07:59:44+01:00'));
    expect(it.endTime).toBe(at('2026-03-02T08:25:16+01:00'));
    expect(it.durationSeconds).toBe(1532);
    expect(it.walkingSeconds).toBe(32);
    expect(it.walkingDistanceMeters).toBe(40);
    expect(it.waitingSeconds).toBe(1532 - 32 - 600 - 600);
    expect(it.transfers).toBe(1);

    const [walk, bus, tram, last] = it.legs;
    expect(walk.from).toEqual({ name: 'Origen', ...from });
    expect(walk.to).toMatchObject({ name: 'Plaza Mayor', stopId: 'A' });
    expect(walk.endTime).toBe(bus.startTime);
    expect(last.to).toEqual({ name: 'Destino', ...to });

    expect(bus.startTime).toBe(at('2026-03-02T08:00:00+01:00'));
    expect(bus.endTime).toBe(at('2026-03-02T08:10:00+01:00'));
    expect(bus.durationSeconds).toBe(600);
    expect(bus.tripId).toBe('T1');
    expect(bus.headsign).toBe('Estación');
    expect(bus.from).toEqual({ name: 'Plaza Mayor', lat: 40.4, lon: -3.7, stopId: 'A', stopCode: '101', time: bus.startTime });
    expect(bus.intermediateStops).toEqual([
      { name: 'Calle Real', lat: 40.4, lon: -3.695, stopId: 'B', stopCode: '102', time: at('2026-03-02T08:05:00+01:00') },
    ]);
    expect(bus.route).toEqual({
      id: 'R1',
      shortName: '1',
      longName: 'Plaza Mayor - Estación',
      type: 3,
      color: '#FF0000',
      textColor: '#FFFFFF',
      agencyName: 'Agencia Test',
    });
    expect(bus.geometry).toHaveLength(5);
    expect(bus.distanceMeters).toBeGreaterThan(848);

    expect(tram.from.stopId).toBe('C');
    expect(tram.to.stopId).toBe('E');
    expect(tram.intermediateStops!.map((s) => s.stopId)).toEqual(['D']);
  });

  it('calcula las próximas salidas de la misma línea y sentido', () => {
    const it = assembler.fromJourney(journey(), from, to, ctx);
    expect(it.legs[1].nextDepartures).toEqual([
      at('2026-03-02T08:00:00+01:00'),
      at('2026-03-02T08:30:00+01:00'),
      at('2026-03-02T09:00:00+01:00'),
    ]);
    expect(it.legs[2].nextDepartures).toEqual([at('2026-03-02T08:15:00+01:00'), at('2026-03-02T08:45:00+01:00')]);
  });

  it('une tramos a pie consecutivos (acceso + transbordo)', () => {
    const j: RawJourney = {
      arrival: 0,
      legs: [
        { kind: 'access', toStop: stopIdx(n, 'C'), seconds: 30, meters: 40 },
        { kind: 'transfer', fromStop: stopIdx(n, 'C'), toStop: stopIdx(n, 'F'), seconds: 100, meters: 125 },
        { kind: 'transit', board: connOf(n, 'T5', 0), alight: connOf(n, 'T5', 0), shift: 0 },
        { kind: 'egress', fromStop: stopIdx(n, 'G'), seconds: 10, meters: 12 },
      ],
    };
    const it = assembler.fromJourney(j, from, STOPS.G, ctx);
    expect(it.legs.map((l) => l.mode)).toEqual(['WALK', 'BUS', 'WALK']);
    const walk = it.legs[0];
    expect(walk.durationSeconds).toBe(130);
    expect(walk.distanceMeters).toBe(165);
    expect(walk.to.stopId).toBe('F');
    expect(walk.geometry).toHaveLength(3);
    expect(walk.endTime).toBe(at('2026-03-02T08:12:00+01:00'));
    expect(walk.startTime).toBe(walk.endTime - 130_000);
  });

  it('descarta tramos a pie de duración 0', () => {
    const j = journey();
    j.legs[0] = { kind: 'access', toStop: stopIdx(n, 'A'), seconds: 0, meters: 0 };
    j.legs[3] = { kind: 'egress', fromStop: stopIdx(n, 'E'), seconds: 0, meters: 0 };
    const it = assembler.fromJourney(j, STOPS.A, STOPS.E, ctx);
    expect(it.legs.map((l) => l.mode)).toEqual(['BUS', 'TRAM']);
    expect(it.walkingSeconds).toBe(0);
    expect(it.startTime).toBe(at('2026-03-02T08:00:00+01:00'));
  });

  it('aplica el desplazamiento de los viajes del día anterior', () => {
    const j: RawJourney = {
      arrival: 0,
      legs: [{ kind: 'transit', board: connOf(n, 'T4', 0), alight: connOf(n, 'T4', 1), shift: -86400 }],
    };
    const tuesday = { ...ctx, base: serviceDayBaseEpoch('20260303', n.timezone) };
    const it = assembler.fromJourney(j, STOPS.A, STOPS.C, tuesday);
    expect(it.startTime).toBe(at('2026-03-03T00:30:00+01:00'));
    expect(it.endTime).toBe(at('2026-03-03T00:40:00+01:00'));
    expect(it.transfers).toBe(0);
  });
});

describe('ItineraryAssembler.walkOnly', () => {
  it('crea un itinerario de un solo tramo a pie', () => {
    const start = at('2026-03-02T10:00:00Z');
    const it = assembler.walkOnly(from, to, start, 1000.4, 1.25);
    expect(it).toEqual({
      startTime: start,
      endTime: start + 800_000,
      durationSeconds: 800,
      walkingSeconds: 800,
      walkingDistanceMeters: 1000,
      waitingSeconds: 0,
      transfers: 0,
      legs: [
        {
          mode: 'WALK',
          from: { name: 'Origen', ...from },
          to: { name: 'Destino', ...to },
          startTime: start,
          endTime: start + 800_000,
          durationSeconds: 800,
          distanceMeters: 1000,
          geometry: [
            [from.lat, from.lon],
            [to.lat, to.lon],
          ],
        },
      ],
    });
  });
});

describe('ItineraryAssembler.routeInfo', () => {
  it('usa la primera agencia si la de la línea no existe', () => {
    const network = { ...n, routes: n.routes.map((r) => ({ ...r, agencyId: 'OTRA' })) };
    expect(new ItineraryAssembler(network).routeInfo(0).agencyName).toBe('Agencia Test');
  });

  it('sin agencias no hay nombre', () => {
    expect(new ItineraryAssembler({ ...n, agencies: [] }).routeInfo(0).agencyName).toBeUndefined();
  });
});

describe('stopPlace', () => {
  it('omite el código vacío', () => {
    expect(stopPlace(n.stops[stopIdx(n, 'F')])).toEqual({
      name: 'Mercado',
      lat: 40.4,
      lon: -3.6888,
      stopId: 'F',
      stopCode: undefined,
      time: undefined,
    });
  });
});
