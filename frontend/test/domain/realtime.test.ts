import { describe, expect, it } from 'vitest';
import {
  alertLevel,
  alertTitle,
  delayColor,
  delayStatus,
  EARLY_COLOR,
  formatAge,
  formatAlertCount,
  formatDelay,
  hasRealtime,
  isTrackable,
  itineraryAlerts,
  LATE_COLOR,
  ON_TIME_COLOR,
  transitTripIds,
  vehicleWhere,
} from '../../src/domain/realtime';
import type { AlertDto } from '../../src/domain/types/api';
import { busLeg, iso, itinerary, NOW, TRANSIT_ITINERARY, walkLeg, WALK_ITINERARY } from '../fixtures';

const alert = (id: string, extra: Partial<AlertDto> = {}): AlertDto => ({
  id,
  header: '',
  cause: 'UNKNOWN_CAUSE',
  effect: 'UNKNOWN_EFFECT',
  severity: 'UNKNOWN_SEVERITY',
  ...extra,
});

describe('retrasos', () => {
  it('clasifica y colorea con un margen de un minuto', () => {
    expect(delayStatus(59)).toBe('on-time');
    expect(delayStatus(-59)).toBe('on-time');
    expect(delayStatus(60)).toBe('late');
    expect(delayStatus(-60)).toBe('early');
    expect(delayColor('on-time')).toBe(ON_TIME_COLOR);
    expect(delayColor('late')).toBe(LATE_COLOR);
    expect(delayColor('early')).toBe(EARLY_COLOR);
  });

  it('formatDelay', () => {
    expect(formatDelay(0)).toBe('Puntual');
    expect(formatDelay(200)).toBe('3 min de retraso');
    expect(formatDelay(-90)).toBe('2 min antes de hora');
    expect(formatDelay(60)).toBe('1 min de retraso');
  });

  it('hasRealtime', () => {
    expect(hasRealtime(busLeg(0, 10))).toBe(false);
    const rt = { scheduledStartTime: iso(0), scheduledEndTime: iso(10), departureDelaySeconds: 0, arrivalDelaySeconds: 0 };
    expect(hasRealtime(busLeg(0, 10, { realtime: rt }))).toBe(true);
  });
});

describe('avisos', () => {
  it('une los avisos de todos los tramos sin repetir', () => {
    const it = itinerary([busLeg(0, 10, { alerts: [alert('a'), alert('b')] }), walkLeg(10, 12), busLeg(12, 20, { alerts: [alert('a')] })]);
    expect(itineraryAlerts(it).map((a) => a.id)).toEqual(['a', 'b']);
    expect(itineraryAlerts(WALK_ITINERARY)).toEqual([]);
  });

  it('título: cabecera, efecto o genérico', () => {
    expect(alertTitle(alert('a', { header: 'Obras' }))).toBe('Obras');
    expect(alertTitle(alert('a', { effect: 'DETOUR' }))).toBe('Desvío');
    expect(alertTitle(alert('a'))).toBe('Aviso');
  });

  it('nivel según gravedad y efecto', () => {
    expect(alertLevel(alert('a', { severity: 'SEVERE' }))).toBe('error');
    expect(alertLevel(alert('a', { effect: 'NO_SERVICE' }))).toBe('error');
    expect(alertLevel(alert('a', { severity: 'WARNING' }))).toBe('warning');
    expect(alertLevel(alert('a', { effect: 'DETOUR' }))).toBe('warning');
    expect(alertLevel(alert('a', { severity: 'INFO' }))).toBe('info');
  });

  it('formatAlertCount', () => {
    expect(formatAlertCount(1)).toBe('1 aviso');
    expect(formatAlertCount(3)).toBe('3 avisos');
  });
});

describe('vehículos', () => {
  it('transitTripIds sin repetir y sin tramos a pie', () => {
    expect(transitTripIds(TRANSIT_ITINERARY)).toEqual(['T1']);
    expect(transitTripIds(itinerary([busLeg(0, 5), busLeg(6, 9), busLeg(10, 12, { tripId: 'T2' })]))).toEqual(['T1', 'T2']);
    expect(transitTripIds(WALK_ITINERARY)).toEqual([]);
    expect(transitTripIds(null)).toEqual([]);
  });

  it('isTrackable: itinerarios en curso o que empiezan pronto', () => {
    expect(isTrackable(TRANSIT_ITINERARY, NOW)).toBe(true);
    expect(isTrackable(TRANSIT_ITINERARY, NOW + 24 * 60_000)).toBe(false);
    expect(isTrackable(TRANSIT_ITINERARY, NOW - 3 * 3600_000)).toBe(false);
    expect(isTrackable(null, NOW)).toBe(false);
  });

  it('vehicleWhere', () => {
    const v = { tripId: 'T', lat: 0, lon: 0 };
    expect(vehicleWhere(v)).toBe('');
    expect(vehicleWhere({ ...v, stopName: 'Sol' })).toBe('hacia Sol');
    expect(vehicleWhere({ ...v, stopName: 'Sol', status: 'STOPPED_AT' })).toBe('en Sol');
    expect(vehicleWhere({ ...v, stopName: 'Sol', status: 'INCOMING_AT' })).toBe('llegando a Sol');
  });

  it('formatAge', () => {
    expect(formatAge(undefined, NOW)).toBe('');
    expect(formatAge(new Date(NOW - 20_000).toISOString(), NOW)).toBe('hace 20 s');
    expect(formatAge(new Date(NOW - 180_000).toISOString(), NOW)).toBe('hace 3 min');
    expect(formatAge(new Date(NOW + 5000).toISOString(), NOW)).toBe('hace 0 s');
  });
});
