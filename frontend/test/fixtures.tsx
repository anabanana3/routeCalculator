import { CssBaseline, ThemeProvider } from '@mui/material';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi, type Mock } from 'vitest';
import type { GeolocationService } from '../src/application/ports/geolocation';
import type { TransitApi } from '../src/application/ports/transit-api';
import { ServicesProvider, type Services } from '../src/application/services';
import type { GeocodeResult, GtfsInfoDto, ItineraryDto, LegDto, PlanResponse } from '../src/domain/types/api';
import type { SelectedPlace } from '../src/domain/types/place';
import { theme } from '../src/ui/theme';
import { TimeZoneContext } from '../src/ui/time-zone';

export const TZ = 'Europe/Madrid';
/** Lunes 2 de marzo de 2026, 08:00 en Madrid. */
export const NOW = Date.parse('2026-03-02T07:00:00Z');
export const iso = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();

export const walkLeg = (from: number, to: number, extra: Partial<LegDto> = {}): LegDto => ({
  mode: 'WALK',
  from: { name: 'Origen', lat: 40.4, lon: -3.7 },
  to: { name: 'Sol', lat: 40.41, lon: -3.7, stopId: 'S1', stopCode: '101' },
  startTime: iso(from),
  endTime: iso(to),
  durationSeconds: (to - from) * 60,
  distanceMeters: 320,
  geometry: [
    [40.4, -3.7],
    [40.41, -3.7],
  ],
  ...extra,
});

export const busLeg = (from: number, to: number, extra: Partial<LegDto> = {}): LegDto => ({
  mode: 'BUS',
  from: { name: 'Sol', lat: 40.41, lon: -3.7, stopId: 'S1', stopCode: '101', time: iso(from) },
  to: { name: 'Atocha', lat: 40.42, lon: -3.69, stopId: 'S2', stopCode: '102', time: iso(to) },
  startTime: iso(from),
  endTime: iso(to),
  durationSeconds: (to - from) * 60,
  distanceMeters: 2400,
  geometry: [
    [40.41, -3.7],
    [40.415, -3.695],
    [40.42, -3.69],
  ],
  route: { id: 'R1', shortName: 'L1', longName: 'Sol - Atocha', type: 3, color: '#D32F2F', textColor: '#FFFFFF' },
  tripId: 'T1',
  headsign: 'Atocha',
  intermediateStops: [{ name: 'Tirso', lat: 40.415, lon: -3.695, stopId: 'S3', time: iso(from + 5) }],
  nextDepartures: [iso(from), iso(from + 10), iso(from + 20)],
  ...extra,
});

export function itinerary(legs: LegDto[], extra: Partial<ItineraryDto> = {}): ItineraryDto {
  const start = Date.parse(legs[0].startTime);
  const end = Date.parse(legs[legs.length - 1].endTime);
  return {
    startTime: legs[0].startTime,
    endTime: legs[legs.length - 1].endTime,
    durationSeconds: (end - start) / 1000,
    walkingSeconds: legs.filter((l) => l.mode === 'WALK').reduce((a, l) => a + l.durationSeconds, 0),
    walkingDistanceMeters: legs.filter((l) => l.mode === 'WALK').reduce((a, l) => a + l.distanceMeters, 0),
    waitingSeconds: 0,
    transfers: Math.max(0, legs.filter((l) => l.mode !== 'WALK').length - 1),
    legs,
    ...extra,
  };
}

export const TRANSIT_ITINERARY = itinerary([walkLeg(0, 4), busLeg(5, 20), walkLeg(20, 23, { from: { name: 'Atocha', lat: 40.42, lon: -3.69 }, to: { name: 'Destino', lat: 40.43, lon: -3.69 } })]);
export const WALK_ITINERARY = itinerary([walkLeg(0, 25, { to: { name: 'Destino', lat: 40.43, lon: -3.69 } })]);

export const PLAN: PlanResponse = {
  requestedDateTime: iso(0),
  timezone: TZ,
  itineraries: [TRANSIT_ITINERARY, WALK_ITINERARY],
};

export const GTFS_INFO: GtfsInfoDto = {
  loaded: true,
  loading: false,
  source: 'local',
  refreshMinutes: 0,
  timezone: TZ,
  agencies: ['Demo'],
  bounds: { minLat: 40.4, minLon: -3.72, maxLat: 40.43, maxLon: -3.68 },
};

export const place = (label: string, lat = 40.4, lon = -3.7, extra: Partial<SelectedPlace> = {}): SelectedPlace => ({
  label,
  lat,
  lon,
  kind: 'address',
  ...extra,
});

type ApiMocks = { [K in keyof TransitApi]: Mock<TransitApi[K]> };

export function fakeApi(overrides: Partial<TransitApi> = {}): ApiMocks {
  return {
    gtfsInfo: vi.fn<TransitApi['gtfsInfo']>(overrides.gtfsInfo ?? (async () => GTFS_INFO)),
    plan: vi.fn<TransitApi['plan']>(overrides.plan ?? (async () => PLAN)),
    geocodeSearch: vi.fn<TransitApi['geocodeSearch']>(overrides.geocodeSearch ?? (async () => ({ results: [] }))),
    geocodeReverse: vi.fn<TransitApi['geocodeReverse']>(overrides.geocodeReverse ?? (async () => ({ result: null }))),
    vehicles: vi.fn<TransitApi['vehicles']>(overrides.vehicles ?? (async () => ({ vehicles: [] }))),
  };
}

/** Resultado del buscador tal y como lo devuelve la API. */
export const geoResult = (label: string, lat = 40.4, lon = -3.7, extra: Partial<GeocodeResult> = {}): GeocodeResult => ({
  label,
  lat,
  lon,
  kind: 'address',
  ...extra,
});

export function fakeGeolocation(impl?: GeolocationService['getCurrentPosition']) {
  return { getCurrentPosition: vi.fn<GeolocationService['getCurrentPosition']>(impl ?? (async () => ({ lat: 40.41, lon: -3.71 }))) };
}

export function servicesWrapper(services: Partial<Services> = {}) {
  const full: Services = { api: fakeApi(), geolocation: fakeGeolocation(), ...services };
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ServicesProvider services={full}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <TimeZoneContext.Provider value={TZ}>{children}</TimeZoneContext.Provider>
        </ThemeProvider>
      </ServicesProvider>
    );
  };
}

export function renderWithProviders(ui: ReactElement, services: Partial<Services> = {}, options?: RenderOptions) {
  return render(ui, { wrapper: servicesWrapper(services), ...options });
}

/** Promesa controlable desde el test. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
