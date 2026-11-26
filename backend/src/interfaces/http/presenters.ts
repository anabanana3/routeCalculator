import type { GeocodeResult } from '../../domain/geocoding/place.js';
import type { AlertInfo, Itinerary, Leg, NoRouteReason, Place, TripPlan } from '../../domain/routing/itinerary.js';
import type { FeedInfo } from '../../application/use-cases/get-feed-info.js';
import type { VehicleInfo } from '../../application/use-cases/get-vehicles.js';
import type { RealtimeStatus } from '../../application/services/realtime-store.js';
import type {
  AlertDto,
  GeocodeResult as GeocodeResultDto,
  GtfsInfoDto,
  ItineraryDto,
  LegDto,
  PlaceDto,
  PlanResponse,
  RealtimeInfoDto,
  VehicleDto,
} from './dto.js';

const iso = (epochMs: number) => new Date(epochMs).toISOString();

export const NO_ROUTE_MESSAGES: Record<NoRouteReason, string> = {
  NO_STOPS_NEAR_ORIGIN: 'No hay paradas cerca del origen',
  NO_STOPS_NEAR_DESTINATION: 'No hay paradas cerca del destino',
  NO_ROUTE_FOUND: 'No se ha encontrado ninguna ruta en transporte público',
};

/** Mensaje público si falla la carga: el detalle (rutas, URLs) solo va al log del servidor. */
export const PUBLIC_LOAD_ERROR = 'Error al cargar los datos GTFS (consulta los logs del servidor)';

export function toPlaceDto(p: Place): PlaceDto {
  const dto: PlaceDto = { name: p.name, lat: p.lat, lon: p.lon };
  if (p.stopId !== undefined) dto.stopId = p.stopId;
  if (p.stopCode !== undefined) dto.stopCode = p.stopCode;
  if (p.time !== undefined) dto.time = iso(p.time);
  return dto;
}

export function toLegDto(l: Leg): LegDto {
  const dto: LegDto = {
    mode: l.mode,
    from: toPlaceDto(l.from),
    to: toPlaceDto(l.to),
    startTime: iso(l.startTime),
    endTime: iso(l.endTime),
    durationSeconds: l.durationSeconds,
    distanceMeters: l.distanceMeters,
    geometry: l.geometry,
  };
  if (l.route) dto.route = { ...l.route };
  if (l.tripId !== undefined) dto.tripId = l.tripId;
  if (l.headsign !== undefined) dto.headsign = l.headsign;
  if (l.intermediateStops) dto.intermediateStops = l.intermediateStops.map(toPlaceDto);
  if (l.nextDepartures) dto.nextDepartures = l.nextDepartures.map(iso);
  if (l.realtime) {
    dto.realtime = {
      scheduledStartTime: iso(l.realtime.scheduledStartTime),
      scheduledEndTime: iso(l.realtime.scheduledEndTime),
      departureDelaySeconds: l.realtime.departureDelaySeconds,
      arrivalDelaySeconds: l.realtime.arrivalDelaySeconds,
    };
    if (l.realtime.vehicleId !== undefined) dto.realtime.vehicleId = l.realtime.vehicleId;
  }
  if (l.alerts && l.alerts.length > 0) dto.alerts = l.alerts.map(toAlertDto);
  return dto;
}

export function toAlertDto(a: AlertInfo): AlertDto {
  const dto: AlertDto = { id: a.id, header: a.header, cause: a.cause, effect: a.effect, severity: a.severity };
  if (a.description) dto.description = a.description;
  if (a.url) dto.url = a.url;
  return dto;
}

export function toItineraryDto(it: Itinerary): ItineraryDto {
  return {
    startTime: iso(it.startTime),
    endTime: iso(it.endTime),
    durationSeconds: it.durationSeconds,
    walkingSeconds: it.walkingSeconds,
    walkingDistanceMeters: it.walkingDistanceMeters,
    waitingSeconds: it.waitingSeconds,
    transfers: it.transfers,
    legs: it.legs.map(toLegDto),
  };
}

export function toPlanResponse(plan: TripPlan): PlanResponse {
  const res: PlanResponse = {
    requestedDateTime: iso(plan.requestedAt),
    timezone: plan.timezone,
    itineraries: plan.itineraries.map(toItineraryDto),
  };
  if (plan.noRouteReason) res.message = NO_ROUTE_MESSAGES[plan.noRouteReason];
  if (plan.realtimeUpdatedAt !== undefined) res.realtimeUpdatedAt = iso(plan.realtimeUpdatedAt);
  return res;
}

export function toRealtimeInfoDto(status: RealtimeStatus): RealtimeInfoDto {
  return {
    enabled: status.enabled,
    refreshSeconds: status.refreshSeconds,
    paused: status.paused,
    // Sin URLs ni detalle de errores: pueden contener claves de acceso.
    feeds: status.feeds.map((f) => ({
      name: f.name,
      lastUpdatedAt: f.lastUpdatedAt?.toISOString(),
      feedTimestamp: f.feedTimestamp?.toISOString(),
      entities: f.entities,
      stale: f.stale,
      error: f.lastError !== undefined,
    })),
  };
}

export function toVehicleDto(v: VehicleInfo): VehicleDto {
  const dto: VehicleDto = { tripId: v.tripId, lat: v.lat, lon: v.lon };
  if (v.bearing !== undefined) dto.bearing = v.bearing;
  if (v.speed !== undefined) dto.speed = v.speed;
  if (v.label !== undefined) dto.label = v.label;
  if (v.timestamp !== undefined) dto.timestamp = iso(v.timestamp);
  if (v.status !== undefined) dto.status = v.status;
  if (v.stopName !== undefined) dto.stopName = v.stopName;
  return dto;
}

export function toGtfsInfoDto(info: FeedInfo): GtfsInfoDto {
  const { status } = info;
  return {
    loaded: status.loaded,
    loading: status.loading,
    source: status.source,
    refreshMinutes: status.refreshMinutes,
    lastLoadedAt: status.lastLoadedAt?.toISOString(),
    lastCheckedAt: status.lastCheckedAt?.toISOString(),
    lastError: status.lastError ? PUBLIC_LOAD_ERROR : undefined,
    timezone: info.timezone,
    agencies: info.agencies,
    stats: info.stats,
    bounds: info.bounds,
    ignoreServiceCalendar: info.ignoreServiceCalendar,
    realtime: info.realtime ? toRealtimeInfoDto(info.realtime) : undefined,
  };
}

export function toGeocodeResultDto(r: GeocodeResult): GeocodeResultDto {
  const dto: GeocodeResultDto = { label: r.label, lat: r.lat, lon: r.lon, kind: r.kind };
  if (r.secondary !== undefined) dto.secondary = r.secondary;
  return dto;
}
