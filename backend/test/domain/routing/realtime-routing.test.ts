import { beforeAll, describe, expect, it } from 'vitest';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import type { RealtimeFeed } from '../../../src/domain/realtime/model.js';
import { buildRealtimeIndex, type RealtimeIndex } from '../../../src/domain/realtime/realtime-index.js';
import { type Access, type RealtimeScan, scanEarliestArrival, type ScanParams } from '../../../src/domain/routing/csa.js';
import { Planner } from '../../../src/domain/routing/planner.js';
import { ServiceCalendar } from '../../../src/domain/routing/service-calendar.js';
import { addDays, parseGtfsTime, serviceDayBaseEpoch } from '../../../src/domain/time/service-time.js';
import { at, connOf } from '../../fixtures/connections.js';
import { buildTestNetwork, near, ROUTING_OPTIONS, stopIdx, STOPS } from '../../fixtures/network.js';
import { alert, feed, RT_DATE, stu, tripUpdate } from '../../fixtures/realtime.js';

let n: TransitNetwork;
let calendar: ServiceCalendar;
const NOW = Date.parse('2026-03-02T07:50:00+01:00');

beforeAll(async () => {
  n = await buildTestNetwork();
  calendar = new ServiceCalendar(n.services);
});

const index = (...feeds: RealtimeFeed[]) => buildRealtimeIndex(n, feeds, NOW);

function scan(idx: RealtimeIndex, departure = '07:55:00') {
  const base = serviceDayBaseEpoch(RT_DATE, n.timezone);
  const dates = [addDays(RT_DATE, -1), RT_DATE, addDays(RT_DATE, 1)] as const;
  const realtime: RealtimeScan = {
    connections: idx.connections,
    instanceCount: idx.instances.length,
    baseSec: base / 1000,
    replaced: [idx.replacedOn(dates[0]), idx.replacedOn(dates[1]), idx.replacedOn(dates[2])],
  };
  const access: Access[] = [{ stop: stopIdx(n, 'A'), seconds: 16, meters: 20 }];
  const e = stopIdx(n, 'E');
  const p: ScanParams = {
    departure: parseGtfsTime(departure),
    access,
    egress: new Map([[e, { stop: e, seconds: 16, meters: 20 }]]),
    activeByDayOffset: [calendar.activeOn(dates[0]), calendar.activeOn(dates[1]), calendar.activeOn(dates[2])],
    minTransferSeconds: 60,
    maxSearchSeconds: 6 * 3600,
    realtime,
  };
  return scanEarliestArrival(n, p);
}

describe('scanEarliestArrival con tiempo real', () => {
  it('sin cambios da el mismo resultado que el horario', () => {
    const j = scan(index(feed([tripUpdate('T1', { delay: 0 })])))!;
    expect(j.arrival).toBe(parseGtfsTime('08:25:00') + 16);
    expect(j.legs[1]).toMatchObject({ kind: 'transit', realtime: true, shift: 0 });
    expect(j.legs[2]).toEqual({ kind: 'transit', board: connOf(n, 'T2', 0), alight: connOf(n, 'T2', 1), shift: 0 });
  });

  it('un retraso hace perder el transbordo', () => {
    const j = scan(index(feed([tripUpdate('T1', { delay: 300 })])))!;
    expect(j.arrival).toBe(parseGtfsTime('08:55:00') + 16);
    expect(j.legs[2]).toMatchObject({ kind: 'transit', board: connOf(n, 'T2b', 0) });
  });

  it('un retraso del segundo vehículo retrasa la llegada', () => {
    const j = scan(index(feed([tripUpdate('T2', { delay: 600 })])))!;
    expect(j.arrival).toBe(parseGtfsTime('08:35:00') + 16);
    expect(j.legs[2]).toMatchObject({ kind: 'transit', realtime: true });
  });

  it('un viaje cancelado no se usa', () => {
    const j = scan(index(feed([tripUpdate('T1', { relationship: 'CANCELED' })])))!;
    expect(j.arrival).toBe(parseGtfsTime('08:55:00') + 16);
    expect(j.legs[1]).toMatchObject({ kind: 'transit', board: connOf(n, 'T1b', 0) });
  });

  it('solo afecta al día de servicio indicado', () => {
    const j = scan(index(feed([tripUpdate('T1', { relationship: 'CANCELED', startDate: '20260309' })])))!;
    expect(j.arrival).toBe(parseGtfsTime('08:25:00') + 16);
  });

  it('respeta la hora de salida en el flujo en tiempo real', () => {
    // T1 sale de A a las 08:02: si se sale a las 08:05 ya no se coge.
    const j = scan(index(feed([tripUpdate('T1', { delay: 120 })])), '08:05:00')!;
    expect(j.legs[1]).toMatchObject({ kind: 'transit', board: connOf(n, 'T1b', 0) });
  });
});

describe('Planner con tiempo real', () => {
  const from = near(STOPS.A);
  const to = near(STOPS.E);
  const query = { from, to, departureTime: at('2026-03-02T07:55:00+01:00') };

  it('usa las horas previstas y conserva las programadas', () => {
    const planner = new Planner(n, ROUTING_OPTIONS);
    const plan = planner.plan(query, index(feed([tripUpdate('T1', { delay: 120, vehicleId: 'BUS-1' })], { timestamp: 1234 })));
    expect(plan.realtimeUpdatedAt).toBe(1_234_000);
    expect(plan.itineraries).toHaveLength(2);
    const bus = plan.itineraries[0].legs[1];
    expect(bus.tripId).toBe('T1');
    expect(bus.startTime).toBe(at('2026-03-02T08:02:00+01:00'));
    expect(bus.endTime).toBe(at('2026-03-02T08:12:00+01:00'));
    expect(bus.realtime).toEqual({
      scheduledStartTime: at('2026-03-02T08:00:00+01:00'),
      scheduledEndTime: at('2026-03-02T08:10:00+01:00'),
      departureDelaySeconds: 120,
      arrivalDelaySeconds: 120,
      vehicleId: 'BUS-1',
    });
    expect(bus.intermediateStops?.map((s) => s.time)).toEqual([at('2026-03-02T08:07:00+01:00')]);
    expect(bus.nextDepartures?.[0]).toBe(bus.startTime);
    // El tramo a pie se ajusta a la salida real.
    expect(plan.itineraries[0].legs[0].endTime).toBe(bus.startTime);
    // El tranvía sigue con su horario programado.
    expect(plan.itineraries[0].legs[2].realtime).toBeUndefined();
    // La siguiente alternativa sale después del bus con retraso.
    expect(plan.itineraries[1].legs[1].tripId).toBe('T1b');
  });

  it('omite paradas suprimidas y marca en tiempo real solo si hay predicción', () => {
    const planner = new Planner(n, ROUTING_OPTIONS);
    const plan = planner.plan(query, index(feed([tripUpdate('T1', { updates: [stu(2, { scheduleRelationship: 'SKIPPED' })] })])));
    const bus = plan.itineraries[0].legs[1];
    expect(bus.intermediateStops).toEqual([]);
    expect(bus.realtime).toBeUndefined();
  });

  it('las próximas salidas usan las horas previstas y omiten los cancelados', () => {
    const planner = new Planner(n, ROUTING_OPTIONS);
    const plan = planner.plan(
      query,
      index(feed([tripUpdate('T1', { delay: 60 }), tripUpdate('T1b', { relationship: 'CANCELED' })])),
    );
    expect(plan.itineraries[0].legs[1].nextDepartures).toEqual([
      at('2026-03-02T08:01:00+01:00'),
      at('2026-03-02T09:00:00+01:00'),
      at('2026-03-02T09:20:00+01:00'),
    ]);
  });

  it('incluye un viaje programado antes de la hora pedida si va con retraso', () => {
    const planner = new Planner(n, ROUTING_OPTIONS);
    const plan = planner.plan({ ...query, departureTime: at('2026-03-02T08:01:00+01:00') }, index(feed([tripUpdate('T1', { delay: 120 })])));
    expect(plan.itineraries[0].legs[1]).toMatchObject({ tripId: 'T1', startTime: at('2026-03-02T08:02:00+01:00') });
  });

  it('adjunta los avisos vigentes a los tramos afectados', () => {
    const planner = new Planner(n, ROUTING_OPTIONS);
    const plan = planner.plan(
      query,
      index(
        feed([], {
          alerts: [
            alert('linea', { informedEntities: [{ routeId: 'R1' }], effect: 'SIGNIFICANT_DELAYS', url: 'https://x.test' }),
            alert('parada', { informedEntities: [{ stopId: 'E' }] }),
            alert('caducado', { informedEntities: [{ routeId: 'R1' }], activePeriods: [{ end: 1 }] }),
          ],
        }),
      ),
    );
    const [, bus, tram] = plan.itineraries[0].legs;
    expect(bus.alerts).toEqual([
      {
        id: 'linea',
        header: 'Aviso linea',
        description: '',
        url: 'https://x.test',
        cause: 'UNKNOWN_CAUSE',
        effect: 'SIGNIFICANT_DELAYS',
        severity: 'UNKNOWN_SEVERITY',
      },
    ]);
    expect(tram.alerts?.map((a) => a.id)).toEqual(['parada']);
  });

  it('los avisos de una estación afectan a sus paradas', async () => {
    const tables = await import('../../fixtures/network.js');
    const withParent = await buildTestNetwork({}, {
      ...tables.TABLES,
      stops: tables.TABLES.stops.map((s) => (s.stop_id === 'A' ? { ...s, parent_station: 'EST' } : s)),
    });
    const plan = new Planner(withParent, ROUTING_OPTIONS).plan(
      query,
      buildRealtimeIndex(withParent, [feed([], { alerts: [alert('est', { informedEntities: [{ stopId: 'EST' }] })] })], NOW),
    );
    expect(plan.itineraries[0].legs[1].alerts?.map((a) => a.id)).toEqual(['est']);
  });

  it('ignora datos cruzados con otra red', async () => {
    const other = await buildTestNetwork();
    const plan = new Planner(n, ROUTING_OPTIONS).plan(query, buildRealtimeIndex(other, [feed([tripUpdate('T1', { delay: 120 })])], NOW));
    expect(plan.realtimeUpdatedAt).toBeUndefined();
    expect(plan.itineraries[0].legs[1].startTime).toBe(at('2026-03-02T08:00:00+01:00'));
  });
});
