import { beforeAll, describe, expect, it } from 'vitest';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import {
  applyTripUpdate,
  buildRealtimeIndex,
  gtfsTripId,
  guessServiceDate,
  resolveTrip,
} from '../../../src/domain/realtime/realtime-index.js';
import { parseGtfsTime } from '../../../src/domain/time/service-time.js';
import { buildTestNetwork, stopIdx, tripIdx } from '../../fixtures/network.js';
import { alert, feed, RT_DATE, stu, tripUpdate, vehicle } from '../../fixtures/realtime.js';

let n: TransitNetwork;
beforeAll(async () => {
  n = await buildTestNetwork();
});

/** epoch s de una hora del lunes 2 de marzo de 2026 en Madrid. */
const t = (hms: string) => Date.parse('2026-03-02T00:00:00+01:00') / 1000 + parseGtfsTime(hms);
const NOW = Date.parse('2026-03-02T08:02:00+01:00');

function apply(tripId: string, tu = tripUpdate(tripId)) {
  return applyTripUpdate(n, tripIdx(n, tripId), RT_DATE, tu);
}

describe('resolveTrip', () => {
  it('encuentra viajes por trip_id', () => {
    expect(resolveTrip(n, { tripId: 'T1', scheduleRelationship: 'SCHEDULED' })).toBe(tripIdx(n, 'T1'));
    expect(resolveTrip(n, { tripId: 'NO', scheduleRelationship: 'SCHEDULED' })).toBeUndefined();
    expect(resolveTrip(n, { scheduleRelationship: 'SCHEDULED' })).toBeUndefined();
    expect(resolveTrip(n, undefined)).toBeUndefined();
  });

  it('los viajes de frequencies.txt se identifican con start_time; la plantilla sola no vale', () => {
    const desc = { tripId: 'T3', startTime: '9:20:00', scheduleRelationship: 'SCHEDULED' as const };
    expect(n.trips[resolveTrip(n, desc)!].id).toBe('T3@09:20:00');
    expect(resolveTrip(n, { ...desc, startTime: undefined })).toBeUndefined();
    expect(resolveTrip(n, { ...desc, startTime: 'basura' })).toBeUndefined();
    // start_time en un viaje normal: se ignora.
    expect(resolveTrip(n, { tripId: 'T1', startTime: '08:00:00', scheduleRelationship: 'SCHEDULED' })).toBe(tripIdx(n, 'T1'));
  });

  it('gtfsTripId quita el sufijo de los viajes generados', () => {
    expect(gtfsTripId(n, tripIdx(n, 'T3@09:20:00'))).toBe('T3');
    expect(gtfsTripId(n, tripIdx(n, 'T1'))).toBe('T1');
  });
});

describe('guessServiceDate', () => {
  it('elige el día cuyo horario queda más cerca de ahora', () => {
    expect(guessServiceDate(n, tripIdx(n, 'T1'), NOW)).toBe('20260302');
    // Martes a las 00:35: el nocturno de las 24:30 es del lunes.
    expect(guessServiceDate(n, tripIdx(n, 'T4'), Date.parse('2026-03-03T00:35:00+01:00'))).toBe('20260302');
    // Domingo a las 23:50: el de las 08:00 más cercano es el del lunes.
    expect(guessServiceDate(n, tripIdx(n, 'T1'), Date.parse('2026-03-01T23:50:00+01:00'))).toBe('20260302');
  });
});

describe('applyTripUpdate', () => {
  it('sin datos mantiene el horario programado', () => {
    const r = apply('T1');
    expect([...r.dep]).toEqual([t('08:00:00'), t('08:05:00'), t('08:10:00')]);
    expect([...r.predicted]).toEqual([0, 0, 0]);
    expect(r.canceled).toBe(false);
    expect(r.baseSec + n.tripTimes[n.trips[r.tripIdx].timesIdx].dep[0]).toBe(t('08:00:00'));
  });

  it('el retraso del viaje se aplica a todas las paradas', () => {
    const r = apply('T1', tripUpdate('T1', { delay: 90 }));
    expect([...r.arr]).toEqual([t('08:01:30'), t('08:06:30'), t('08:11:30')]);
    expect([...r.predicted]).toEqual([1, 1, 1]);
  });

  it('propaga el retraso hacia delante y NO_DATA lo corta', () => {
    const r = apply(
      'T2',
      tripUpdate('T2', {
        updates: [stu(1, { departure: { delay: 120 } }), stu(2, { scheduleRelationship: 'NO_DATA' })],
      }),
    );
    expect([...r.dep]).toEqual([t('08:17:00'), t('08:20:00'), t('08:25:00')]);
    expect([...r.predicted]).toEqual([1, 0, 0]);
  });

  it('las horas absolutas mandan y se conserva el tiempo de parada', () => {
    const r = apply(
      'T1',
      tripUpdate('T1', {
        updates: [stu(2, { arrival: { time: t('08:07:00') } }), stu(3, { departure: { delay: -30 } })],
      }),
    );
    // Antes de la primera actualización no hay información: horario programado.
    expect(r.dep[0]).toBe(t('08:00:00'));
    expect(r.arr[1]).toBe(t('08:07:00'));
    expect(r.dep[1]).toBe(t('08:07:00'));
    // Adelanto de 30 s en C, pero nunca antes de salir de B.
    expect(r.arr[2]).toBe(t('08:09:30'));
  });

  it('las horas nunca retroceden a lo largo del viaje', () => {
    const r = apply('T1', tripUpdate('T1', { updates: [stu(1, { departure: { delay: 600 } }), stu(2, { arrival: { delay: 0 } })] }));
    expect(r.dep[0]).toBe(t('08:10:00'));
    expect(r.arr[1]).toBe(t('08:10:00'));
  });

  it('casa por stop_id si falta stop_sequence', () => {
    const r = apply('T1', tripUpdate('T1', { updates: [{ stopId: 'B', scheduleRelationship: 'SCHEDULED', arrival: { delay: 60 } }] }));
    expect(r.arr[1]).toBe(t('08:06:00'));
    expect(r.arr[2]).toBe(t('08:11:00'));
  });

  it('ignora actualizaciones de paradas que no están en el viaje', () => {
    const r = apply('T1', tripUpdate('T1', { updates: [stu(99, { arrival: { delay: 60 } }), { stopId: 'G', scheduleRelationship: 'SCHEDULED' }] }));
    expect([...r.predicted]).toEqual([0, 0, 0]);
  });

  it('una actualización sin horas usa el retraso que se arrastra', () => {
    const r = apply('T1', tripUpdate('T1', { delay: 60, updates: [stu(2)] }));
    expect(r.arr[1]).toBe(t('08:06:00'));
  });

  it('marca paradas suprimidas y viajes cancelados', () => {
    expect([...apply('T1', tripUpdate('T1', { updates: [stu(2, { scheduleRelationship: 'SKIPPED' })] })).skipped]).toEqual([0, 1, 0]);
    expect(apply('T1', tripUpdate('T1', { relationship: 'CANCELED' })).canceled).toBe(true);
    expect(apply('T1', tripUpdate('T1', { relationship: 'DELETED' })).canceled).toBe(true);
    const allSkipped = [1, 2, 3].map((s) => stu(s, { scheduleRelationship: 'SKIPPED' }));
    expect(apply('T1', tripUpdate('T1', { updates: allSkipped })).canceled).toBe(true);
  });
});

describe('buildRealtimeIndex', () => {
  it('crea conexiones con las horas previstas, saltando paradas suprimidas y viajes cancelados', () => {
    const idx = buildRealtimeIndex(
      n,
      [
        feed([
          tripUpdate('T1', { delay: 60, updates: [stu(2, { scheduleRelationship: 'SKIPPED' })] }),
          tripUpdate('T2', { relationship: 'CANCELED' }),
        ]),
      ],
      NOW,
    );
    expect(idx.instances).toHaveLength(2);
    const R = idx.connections;
    expect(R.count).toBe(1);
    expect(R.depStop[0]).toBe(stopIdx(n, 'A'));
    expect(R.arrStop[0]).toBe(stopIdx(n, 'C'));
    expect(R.depTime[0]).toBe(t('08:01:00'));
    expect(R.arrTime[0]).toBe(t('08:11:00'));
    expect([R.fromPos[0], R.toPos[0]]).toEqual([0, 2]);
    expect(idx.instance(tripIdx(n, 'T2'), RT_DATE)?.canceled).toBe(true);
    expect(idx.instance(tripIdx(n, 'T2'), '20260303')).toBeUndefined();
  });

  it('ordena las conexiones por hora de salida', () => {
    const idx = buildRealtimeIndex(n, [feed([tripUpdate('T2', { delay: 0 }), tripUpdate('T1', { delay: 0 })])], NOW);
    const deps = [...idx.connections.depTime];
    expect(deps).toEqual([...deps].sort((a, b) => a - b));
    expect(idx.connections.count).toBe(4);
  });

  it('descarta viajes añadidos o desconocidos y se queda con la actualización más reciente', () => {
    const idx = buildRealtimeIndex(
      n,
      [
        feed([tripUpdate('T1', { delay: 60, timestamp: 100 }), tripUpdate('NUEVO', { relationship: 'ADDED' }), tripUpdate('NO_EXISTE')]),
        feed([tripUpdate('T1', { delay: 30, timestamp: 50 }), tripUpdate('T2', { relationship: 'NEW' })]),
      ],
      NOW,
    );
    expect(idx.instances).toHaveLength(1);
    expect(idx.instances[0].dep[0]).toBe(t('08:01:00'));
  });

  it('sin start_date deduce el día de servicio', () => {
    const idx = buildRealtimeIndex(n, [feed([tripUpdate('T1', { startDate: null, delay: 60 })])], NOW);
    expect(idx.instances[0].serviceDate).toBe(RT_DATE);
  });

  it('replacedOn marca los viajes con datos ese día', () => {
    const idx = buildRealtimeIndex(n, [feed([tripUpdate('T1')])], NOW);
    const mask = idx.replacedOn(RT_DATE);
    expect(mask[tripIdx(n, 'T1')]).toBe(1);
    expect(mask[tripIdx(n, 'T2')]).toBe(0);
    expect(idx.replacedOn(RT_DATE)).toBe(mask);
    expect(idx.replacedOn('20260303').every((v) => v === 0)).toBe(true);
    for (let d = 10; d < 20; d++) idx.replacedOn(`202603${d}`);
    expect(idx.replacedOn(RT_DATE)).not.toBe(mask);
  });

  it('asocia vehículos a viajes por el viaje o por el vehículo del TripUpdate', () => {
    const idx = buildRealtimeIndex(
      n,
      [
        feed([tripUpdate('T2', { vehicleId: 'BUS-7' })], {
          vehicles: [
            vehicle('e1', { trip: { tripId: 'T1', scheduleRelationship: 'SCHEDULED' }, timestamp: 10, lat: 1 }),
            vehicle('e2', { trip: { tripId: 'T1', scheduleRelationship: 'SCHEDULED' }, timestamp: 20, lat: 2 }),
            vehicle('e3', { trip: { tripId: 'T1', scheduleRelationship: 'SCHEDULED' }, timestamp: 5, lat: 3 }),
            vehicle('e4', { vehicleId: 'BUS-7' }),
            vehicle('e5', { vehicleId: 'OTRO' }),
            vehicle('e6'),
          ],
        }),
      ],
      NOW,
    );
    expect(idx.vehicles.get('T1')?.lat).toBe(2);
    expect(idx.vehicles.get('T2')?.id).toBe('e4');
    expect(idx.vehicles.size).toBe(2);
  });

  it('une los avisos de todos los feeds y calcula la hora de los datos', () => {
    const idx = buildRealtimeIndex(
      n,
      [feed([], { alerts: [alert('a1'), alert('a2')], timestamp: 1000 }), feed([], { alerts: [alert('a1', { header: 'nuevo' })], timestamp: 2000 })],
      NOW,
    );
    expect(idx.alerts.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(idx.alerts[0].header).toBe('nuevo');
    expect(idx.updatedAt).toBe(2_000_000);
    expect(buildRealtimeIndex(n, [feed()], NOW).updatedAt).toBe(NOW);
  });

  it('alertsFor filtra por selector y vigencia', () => {
    const idx = buildRealtimeIndex(
      n,
      [feed([], { alerts: [alert('r1', { informedEntities: [{ routeId: 'R1' }] }), alert('r2', { informedEntities: [{ routeId: 'R2' }] })] })],
      NOW,
    );
    const target = { agencyId: 'AG', routeId: 'R1', routeType: 3, directionId: 0, tripId: 'T1', stopIds: new Set(['A']) };
    expect(idx.alertsFor(target, 0, 1).map((a) => a.id)).toEqual(['r1']);
  });
});
