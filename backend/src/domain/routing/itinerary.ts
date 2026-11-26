import type { Coord, LatLon } from '../geo/geo.js';

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

export interface Place {
  name: string;
  lat: number;
  lon: number;
  stopId?: string;
  stopCode?: string;
  /** Hora de paso (epoch ms) en paradas intermedias. */
  time?: number;
}

export interface RouteInfo {
  id: string;
  shortName: string;
  longName: string;
  type: number;
  color: string;
  textColor: string;
  agencyName?: string;
}

export interface AlertInfo {
  id: string;
  header: string;
  description: string;
  url: string;
  cause: string;
  effect: string;
  severity: string;
}

/** Datos en tiempo real de un tramo en vehículo. */
export interface LegRealtime {
  /** epoch ms */
  scheduledStartTime: number;
  /** epoch ms */
  scheduledEndTime: number;
  /** Positivo = retraso; negativo = adelanto. */
  departureDelaySeconds: number;
  arrivalDelaySeconds: number;
  vehicleId?: string;
}

export interface Leg {
  mode: LegMode;
  from: Place;
  to: Place;
  /** epoch ms */
  startTime: number;
  /** epoch ms */
  endTime: number;
  durationSeconds: number;
  distanceMeters: number;
  geometry: Coord[];
  route?: RouteInfo;
  tripId?: string;
  headsign?: string;
  intermediateStops?: Place[];
  /** Próximas salidas (epoch ms) de la misma línea y sentido desde la parada de subida. */
  nextDepartures?: number[];
  /** Solo si las horas del tramo vienen de GTFS-Realtime. */
  realtime?: LegRealtime;
  /** Avisos vigentes que afectan a la línea, al viaje o a las paradas de subida y bajada. */
  alerts?: AlertInfo[];
}

export interface Itinerary {
  startTime: number;
  endTime: number;
  durationSeconds: number;
  walkingSeconds: number;
  walkingDistanceMeters: number;
  waitingSeconds: number;
  transfers: number;
  legs: Leg[];
}

export type NoRouteReason = 'NO_STOPS_NEAR_ORIGIN' | 'NO_STOPS_NEAR_DESTINATION' | 'NO_ROUTE_FOUND';

export interface TripQuery {
  from: LatLon;
  to: LatLon;
  /** Hora de salida (epoch ms). */
  departureTime: number;
  maxItineraries?: number;
}

export interface TripPlan {
  /** epoch ms */
  requestedAt: number;
  timezone: string;
  itineraries: Itinerary[];
  /** Motivo por el que no hay itinerarios (solo si la lista está vacía). */
  noRouteReason?: NoRouteReason;
  /** epoch ms de los datos en tiempo real usados (ausente si no se han usado). */
  realtimeUpdatedAt?: number;
}
