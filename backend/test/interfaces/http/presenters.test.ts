import { describe, expect, it } from 'vitest';
import type { FeedInfo } from '../../../src/application/use-cases/get-feed-info.js';
import type { Itinerary, TripPlan } from '../../../src/domain/routing/itinerary.js';
import {
  NO_ROUTE_MESSAGES,
  PUBLIC_LOAD_ERROR,
  toGeocodeResultDto,
  toGtfsInfoDto,
  toItineraryDto,
  toLegDto,
  toPlaceDto,
  toPlanResponse,
  toRealtimeInfoDto,
  toVehicleDto,
} from '../../../src/interfaces/http/presenters.js';

const T0 = Date.parse('2026-03-02T07:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

const itinerary: Itinerary = {
  startTime: T0,
  endTime: T0 + 600_000,
  durationSeconds: 600,
  walkingSeconds: 60,
  walkingDistanceMeters: 75,
  waitingSeconds: 0,
  transfers: 0,
  legs: [
    {
      mode: 'WALK',
      from: { name: 'Origen', lat: 1, lon: 2 },
      to: { name: 'Sol', lat: 1.1, lon: 2.1, stopId: 'S1', stopCode: '101' },
      startTime: T0,
      endTime: T0 + 60_000,
      durationSeconds: 60,
      distanceMeters: 75,
      geometry: [
        [1, 2],
        [1.1, 2.1],
      ],
    },
    {
      mode: 'BUS',
      from: { name: 'Sol', lat: 1.1, lon: 2.1, stopId: 'S1', time: T0 + 60_000 },
      to: { name: 'Atocha', lat: 1.2, lon: 2.2, stopId: 'S2', time: T0 + 600_000 },
      startTime: T0 + 60_000,
      endTime: T0 + 600_000,
      durationSeconds: 540,
      distanceMeters: 2000,
      geometry: [],
      route: { id: 'R', shortName: '1', longName: 'Uno', type: 3, color: '#FF0000', textColor: '#FFFFFF' },
      tripId: 'T',
      headsign: 'Atocha',
      intermediateStops: [{ name: 'Medio', lat: 1.15, lon: 2.15, stopId: 'S3', time: T0 + 300_000 }],
      nextDepartures: [T0 + 60_000, T0 + 660_000],
    },
  ],
};

describe('toPlaceDto', () => {
  it('convierte la hora a ISO y omite campos ausentes', () => {
    expect(toPlaceDto({ name: 'A', lat: 1, lon: 2 })).toEqual({ name: 'A', lat: 1, lon: 2 });
    expect(toPlaceDto({ name: 'A', lat: 1, lon: 2, stopId: 'S', stopCode: 'C', time: T0 })).toEqual({
      name: 'A',
      lat: 1,
      lon: 2,
      stopId: 'S',
      stopCode: 'C',
      time: '2026-03-02T07:00:00.000Z',
    });
  });
});

describe('toItineraryDto', () => {
  it('convierte todas las horas a ISO', () => {
    const dto = toItineraryDto(itinerary);
    expect(dto.startTime).toBe(iso(T0));
    expect(dto.endTime).toBe(iso(T0 + 600_000));
    expect(dto.legs[0]).toEqual({
      mode: 'WALK',
      from: { name: 'Origen', lat: 1, lon: 2 },
      to: { name: 'Sol', lat: 1.1, lon: 2.1, stopId: 'S1', stopCode: '101' },
      startTime: iso(T0),
      endTime: iso(T0 + 60_000),
      durationSeconds: 60,
      distanceMeters: 75,
      geometry: [
        [1, 2],
        [1.1, 2.1],
      ],
    });
    const bus = dto.legs[1];
    expect(bus.route).toEqual(itinerary.legs[1].route);
    expect(bus.tripId).toBe('T');
    expect(bus.headsign).toBe('Atocha');
    expect(bus.intermediateStops).toEqual([{ name: 'Medio', lat: 1.15, lon: 2.15, stopId: 'S3', time: iso(T0 + 300_000) }]);
    expect(bus.nextDepartures).toEqual([iso(T0 + 60_000), iso(T0 + 660_000)]);
  });
});

describe('toPlanResponse', () => {
  it('con itinerarios no incluye mensaje', () => {
    const plan: TripPlan = { requestedAt: T0, timezone: 'Europe/Madrid', itineraries: [itinerary] };
    const res = toPlanResponse(plan);
    expect(res.requestedDateTime).toBe(iso(T0));
    expect(res.timezone).toBe('Europe/Madrid');
    expect(res.itineraries).toHaveLength(1);
    expect(res).not.toHaveProperty('message');
  });

  it.each(Object.entries(NO_ROUTE_MESSAGES))('traduce el motivo %s', (reason, message) => {
    const plan = { requestedAt: T0, timezone: 'UTC', itineraries: [], noRouteReason: reason } as TripPlan;
    expect(toPlanResponse(plan).message).toBe(message);
  });
});

describe('toGtfsInfoDto', () => {
  const info: FeedInfo = {
    status: {
      loaded: true,
      loading: false,
      source: 'url',
      refreshMinutes: 60,
      lastLoadedAt: new Date(T0),
      lastCheckedAt: new Date(T0 + 1000),
    },
    timezone: 'Europe/Madrid',
    agencies: ['A'],
    stats: { stops: 1, routes: 2, trips: 3, connections: 4 },
    bounds: { minLat: 1, minLon: 2, maxLat: 3, maxLon: 4 },
    ignoreServiceCalendar: false,
  };

  it('convierte fechas y copia los datos públicos', () => {
    expect(toGtfsInfoDto(info)).toEqual({
      loaded: true,
      loading: false,
      source: 'url',
      refreshMinutes: 60,
      lastLoadedAt: iso(T0),
      lastCheckedAt: iso(T0 + 1000),
      lastError: undefined,
      timezone: 'Europe/Madrid',
      agencies: ['A'],
      stats: { stops: 1, routes: 2, trips: 3, connections: 4 },
      bounds: { minLat: 1, minLon: 2, maxLat: 3, maxLon: 4 },
      ignoreServiceCalendar: false,
    });
  });

  it('no expone el detalle del error (rutas o URLs internas)', () => {
    const dto = toGtfsInfoDto({ ...info, status: { ...info.status, lastError: 'No existe /home/app/secret?key=1' } });
    expect(dto.lastError).toBe(PUBLIC_LOAD_ERROR);
    expect(JSON.stringify(dto)).not.toContain('secret');
  });

  it('nunca incluye la ubicación del feed', () => {
    expect(toGtfsInfoDto(info)).not.toHaveProperty('location');
  });
});

describe('toGeocodeResultDto', () => {
  it('copia los campos y omite secondary ausente', () => {
    expect(toGeocodeResultDto({ label: 'A', lat: 1, lon: 2, kind: 'stop' })).toEqual({ label: 'A', lat: 1, lon: 2, kind: 'stop' });
    expect(toGeocodeResultDto({ label: 'A', secondary: 'B', lat: 1, lon: 2, kind: 'poi' }).secondary).toBe('B');
  });
});

describe('tiempo real', () => {
  const alert = { id: 'a', header: 'Obras', description: '', url: '', cause: 'CONSTRUCTION', effect: 'DETOUR', severity: 'WARNING' };

  it('toLegDto incluye las horas programadas, el retraso y los avisos', () => {
    const leg = {
      ...itinerary.legs[1],
      realtime: {
        scheduledStartTime: T0,
        scheduledEndTime: T0 + 540_000,
        departureDelaySeconds: 60,
        arrivalDelaySeconds: -30,
        vehicleId: 'BUS-1',
      },
      alerts: [alert, { ...alert, id: 'b', description: 'Detalle', url: 'https://x.test' }],
    };
    const dto = toLegDto(leg);
    expect(dto.realtime).toEqual({
      scheduledStartTime: iso(T0),
      scheduledEndTime: iso(T0 + 540_000),
      departureDelaySeconds: 60,
      arrivalDelaySeconds: -30,
      vehicleId: 'BUS-1',
    });
    expect(dto.alerts).toEqual([
      { id: 'a', header: 'Obras', cause: 'CONSTRUCTION', effect: 'DETOUR', severity: 'WARNING' },
      { id: 'b', header: 'Obras', description: 'Detalle', url: 'https://x.test', cause: 'CONSTRUCTION', effect: 'DETOUR', severity: 'WARNING' },
    ]);
    const { vehicleId: _v, ...noVehicle } = leg.realtime;
    expect(toLegDto({ ...leg, realtime: noVehicle, alerts: [] })).not.toHaveProperty('alerts');
    expect(toLegDto({ ...leg, realtime: noVehicle }).realtime).not.toHaveProperty('vehicleId');
    expect(toLegDto(itinerary.legs[1])).not.toHaveProperty('realtime');
  });

  it('toPlanResponse indica la hora de los datos en tiempo real', () => {
    const plan: TripPlan = { requestedAt: T0, timezone: 'UTC', itineraries: [], realtimeUpdatedAt: T0 - 5000 };
    expect(toPlanResponse(plan).realtimeUpdatedAt).toBe(iso(T0 - 5000));
  });

  it('toRealtimeInfoDto no expone el detalle de los errores', () => {
    const dto = toRealtimeInfoDto({
      enabled: true,
      refreshSeconds: 30,
      paused: false,
      feeds: [
        { name: 'tu', entities: 3, stale: false, failures: 0, lastUpdatedAt: new Date(T0), feedTimestamp: new Date(T0 - 1000) },
        { name: 'al', entities: 0, stale: true, failures: 2, lastError: 'HTTP 403 https://x?key=secreto' },
      ],
    });
    expect(dto).toEqual({
      enabled: true,
      refreshSeconds: 30,
      paused: false,
      feeds: [
        { name: 'tu', lastUpdatedAt: iso(T0), feedTimestamp: iso(T0 - 1000), entities: 3, stale: false, error: false },
        { name: 'al', lastUpdatedAt: undefined, feedTimestamp: undefined, entities: 0, stale: true, error: true },
      ],
    });
    expect(JSON.stringify(dto)).not.toContain('secreto');
  });

  it('toGtfsInfoDto incluye el estado del tiempo real si existe', () => {
    const info: FeedInfo = {
      status: { loaded: true, loading: false, source: 'local', refreshMinutes: 0 },
      agencies: [],
      ignoreServiceCalendar: false,
      realtime: { enabled: false, refreshSeconds: 30, paused: false, feeds: [] },
    };
    expect(toGtfsInfoDto(info).realtime).toEqual({ enabled: false, refreshSeconds: 30, paused: false, feeds: [] });
  });

  it('toVehicleDto omite los campos ausentes', () => {
    expect(toVehicleDto({ tripId: 'T', lat: 1, lon: 2 })).toEqual({ tripId: 'T', lat: 1, lon: 2 });
    expect(
      toVehicleDto({
        tripId: 'T',
        vehicleId: 'V',
        lat: 1,
        lon: 2,
        bearing: 0,
        speed: 3,
        label: 'Bus',
        timestamp: T0,
        status: 'STOPPED_AT',
        stopName: 'Sol',
      }),
    ).toEqual({ tripId: 'T', lat: 1, lon: 2, bearing: 0, speed: 3, label: 'Bus', timestamp: iso(T0), status: 'STOPPED_AT', stopName: 'Sol' });
  });
});
