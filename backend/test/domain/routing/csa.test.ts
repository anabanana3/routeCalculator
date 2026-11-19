import { beforeAll, describe, expect, it } from 'vitest';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { type Access, INF, lowerBound, scanEarliestArrival, type ScanParams } from '../../../src/domain/routing/csa.js';
import { ServiceCalendar } from '../../../src/domain/routing/service-calendar.js';
import { addDays, parseGtfsTime, SECONDS_PER_DAY } from '../../../src/domain/time/service-time.js';
import { connOf } from '../../fixtures/connections.js';
import { buildTestNetwork, stopIdx } from '../../fixtures/network.js';

let n: TransitNetwork;
let calendar: ServiceCalendar;

beforeAll(async () => {
  n = await buildTestNetwork();
  calendar = new ServiceCalendar(n.services);
});

function params(date: string, departure: string, from: string, to: string, extra: Partial<ScanParams> = {}): ScanParams {
  const access: Access[] = [{ stop: stopIdx(n, from), seconds: 16, meters: 20 }];
  const egressStop = stopIdx(n, to);
  return {
    departure: parseGtfsTime(departure),
    access,
    egress: new Map([[egressStop, { stop: egressStop, seconds: 16, meters: 20 }]]),
    activeByDayOffset: [calendar.activeOn(addDays(date, -1)), calendar.activeOn(date), calendar.activeOn(addDays(date, 1))],
    minTransferSeconds: 60,
    maxSearchSeconds: 6 * 3600,
    ...extra,
  };
}

describe('lowerBound', () => {
  const arr = Int32Array.from([10, 20, 20, 30]);
  it('devuelve la primera posición >= valor', () => {
    expect(lowerBound(arr, 4, 5)).toBe(0);
    expect(lowerBound(arr, 4, 20)).toBe(1);
    expect(lowerBound(arr, 4, 21)).toBe(3);
    expect(lowerBound(arr, 4, 31)).toBe(4);
  });
  it('respeta el número de elementos indicado', () => {
    expect(lowerBound(arr, 2, 25)).toBe(2);
    expect(lowerBound(arr, 0, 0)).toBe(0);
  });
});

describe('scanEarliestArrival', () => {
  it('encuentra la ruta con transbordo en la misma parada', () => {
    const j = scanEarliestArrival(n, params('20260302', '07:55:00', 'A', 'E'))!;
    expect(j).not.toBeNull();
    expect(j.arrival).toBe(parseGtfsTime('08:25:00') + 16);
    expect(j.legs).toEqual([
      { kind: 'access', toStop: stopIdx(n, 'A'), seconds: 16, meters: 20 },
      { kind: 'transit', board: connOf(n, 'T1', 0), alight: connOf(n, 'T1', 1), shift: 0 },
      { kind: 'transit', board: connOf(n, 'T2', 0), alight: connOf(n, 'T2', 1), shift: 0 },
      { kind: 'egress', fromStop: stopIdx(n, 'E'), seconds: 16, meters: 20 },
    ]);
  });

  it('respeta el tiempo mínimo de transbordo', () => {
    // Se llega a C a las 08:10; con 6 min de margen ya no da tiempo al tranvía de las 08:15.
    const j = scanEarliestArrival(n, params('20260302', '07:55:00', 'A', 'E', { minTransferSeconds: 360 }))!;
    expect(j.arrival).toBe(parseGtfsTime('08:55:00') + 16);
  });

  it('usa transbordos a pie entre paradas cercanas', () => {
    const j = scanEarliestArrival(n, params('20260302', '07:55:00', 'A', 'G'))!;
    expect(j.legs.map((l) => l.kind)).toEqual(['access', 'transit', 'transfer', 'transit', 'egress']);
    const transfer = j.legs[2];
    expect(transfer).toMatchObject({ kind: 'transfer', fromStop: stopIdx(n, 'C'), toStop: stopIdx(n, 'F') });
    expect(j.arrival).toBe(parseGtfsTime('08:20:00') + 16);
  });

  it('no encuentra nada si ningún servicio circula', () => {
    // Sábado: el servicio WK no circula.
    expect(scanEarliestArrival(n, params('20260307', '07:55:00', 'A', 'E'))).toBeNull();
  });

  it('usa los servicios nocturnos del día anterior (horas > 24:00)', () => {
    // Martes 3 (servicio suprimido) a las 00:20: sale el nocturno del lunes de las 24:30.
    const j = scanEarliestArrival(n, params('20260303', '00:20:00', 'A', 'C'))!;
    expect(j.legs[1]).toMatchObject({ kind: 'transit', shift: -SECONDS_PER_DAY });
    expect(j.arrival).toBe(parseGtfsTime('00:40:00') + 16);
  });

  it('usa los servicios del día siguiente', () => {
    // Domingo 1 a las 23:00: el primer bus es el del lunes a las 08:00 (dentro de la ventana de búsqueda).
    const j = scanEarliestArrival(n, params('20260301', '23:00:00', 'A', 'C', { maxSearchSeconds: 10 * 3600 }))!;
    expect(j.legs[1]).toMatchObject({ kind: 'transit', shift: SECONDS_PER_DAY });
    expect(j.arrival).toBe(SECONDS_PER_DAY + parseGtfsTime('08:10:00') + 16);
  });

  it('limita la búsqueda a maxSearchSeconds', () => {
    expect(scanEarliestArrival(n, params('20260302', '07:55:00', 'A', 'E', { maxSearchSeconds: 60 }))).toBeNull();
  });

  it('no encuentra nada sin paradas de acceso', () => {
    expect(scanEarliestArrival(n, params('20260302', '07:55:00', 'A', 'E', { access: [] }))).toBeNull();
  });

  it('elige el acceso más rápido cuando hay varios', () => {
    const p = params('20260302', '07:55:00', 'A', 'E');
    p.access = [
      { stop: stopIdx(n, 'B'), seconds: 1000, meters: 1250 },
      { stop: stopIdx(n, 'A'), seconds: 16, meters: 20 },
    ];
    const j = scanEarliestArrival(n, p)!;
    expect(j.legs[0]).toEqual({ kind: 'access', toStop: stopIdx(n, 'A'), seconds: 16, meters: 20 });
  });

  it('INF es mayor que cualquier hora razonable', () => {
    expect(INF).toBeGreaterThan(30 * SECONDS_PER_DAY);
  });
});
