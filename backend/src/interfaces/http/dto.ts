// Tipos del contrato de la API (DTO). Se mantienen sincronizados con frontend/src/domain/types/api.ts

export interface LatLon {
  lat: number;
  lon: number;
}

export interface PlanRequest {
  from: LatLon;
  to: LatLon;
  /** ISO 8601. Si no se indica, se usa la hora actual. */
  dateTime?: string;
  maxItineraries?: number;
}

export type LegMode =
  | 'WALK'
  | 'BUS'
  | 'TRAM'
  | 'SUBWAY'
  | 'RAIL'
  | 'FERRY'
  | 'CABLE_CAR'
  | 'GONDOLA'
  | 'FUNICULAR'
  | 'TROLLEYBUS'
  | 'MONORAIL';

export interface PlaceDto {
  name: string;
  lat: number;
  lon: number;
  stopId?: string;
  stopCode?: string;
  /** Hora de paso (ISO) en paradas intermedias. */
  time?: string;
}

export interface RouteDto {
  id: string;
  shortName: string;
  longName: string;
  type: number;
  color: string;
  textColor: string;
  agencyName?: string;
}

export interface LegDto {
  mode: LegMode;
  from: PlaceDto;
  to: PlaceDto;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  distanceMeters: number;
  /** Polilínea [lat, lon]. */
  geometry: [number, number][];
  route?: RouteDto;
  tripId?: string;
  headsign?: string;
  intermediateStops?: PlaceDto[];
  /** Próximas salidas de la misma línea y sentido desde la parada de subida (ISO). */
  nextDepartures?: string[];
}

export interface ItineraryDto {
  startTime: string;
  endTime: string;
  durationSeconds: number;
  walkingSeconds: number;
  walkingDistanceMeters: number;
  waitingSeconds: number;
  transfers: number;
  legs: LegDto[];
}

export interface PlanResponse {
  requestedDateTime: string;
  timezone: string;
  itineraries: ItineraryDto[];
  message?: string;
}

export interface GtfsInfoDto {
  loaded: boolean;
  loading: boolean;
  source: 'local' | 'url';
  refreshMinutes: number;
  lastLoadedAt?: string;
  lastCheckedAt?: string;
  lastError?: string;
  timezone?: string;
  agencies: string[];
  stats?: { stops: number; routes: number; trips: number; connections: number };
  bounds?: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  /** Modo depuración: se ignora el calendario de servicios. */
  ignoreServiceCalendar?: boolean;
}

export type GeocodeKind = 'address' | 'street' | 'poi' | 'stop';

export interface GeocodeResult {
  label: string;
  secondary?: string;
  lat: number;
  lon: number;
  kind: GeocodeKind;
}

export interface GeocodeSearchResponse {
  results: GeocodeResult[];
  warning?: string;
}

export interface GeocodeReverseResponse {
  result: GeocodeResult | null;
}
