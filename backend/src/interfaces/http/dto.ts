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

export interface AlertDto {
  id: string;
  header: string;
  description?: string;
  url?: string;
  /** Valores de GTFS-Realtime: Alert.Cause, Alert.Effect y Alert.SeverityLevel. */
  cause: string;
  effect: string;
  severity: string;
}

/** Horas del tramo según GTFS-Realtime (startTime/endTime ya son las previstas). */
export interface LegRealtimeDto {
  scheduledStartTime: string;
  scheduledEndTime: string;
  /** Positivo = retraso; negativo = adelanto. */
  departureDelaySeconds: number;
  arrivalDelaySeconds: number;
  vehicleId?: string;
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
  realtime?: LegRealtimeDto;
  alerts?: AlertDto[];
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
  /** Momento de los datos en tiempo real usados (ausente si el cálculo usa solo horarios programados). */
  realtimeUpdatedAt?: string;
}

export interface RealtimeFeedStatusDto {
  name: string;
  lastUpdatedAt?: string;
  feedTimestamp?: string;
  entities: number;
  stale: boolean;
  error: boolean;
}

export interface RealtimeInfoDto {
  enabled: boolean;
  refreshSeconds: number;
  paused: boolean;
  feeds: RealtimeFeedStatusDto[];
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
  realtime?: RealtimeInfoDto;
}

export type VehicleStatus = 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';

export interface VehicleDto {
  tripId: string;
  lat: number;
  lon: number;
  /** Grados desde el norte en sentido horario. */
  bearing?: number;
  /** m/s */
  speed?: number;
  label?: string;
  /** Momento de la posición (ISO). */
  timestamp?: string;
  status?: VehicleStatus;
  stopName?: string;
}

export interface VehiclesResponse {
  vehicles: VehicleDto[];
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
