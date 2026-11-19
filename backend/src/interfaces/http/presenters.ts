import type { GeocodeResult } from '../../domain/geocoding/place.js';
import type { Itinerary, Leg, NoRouteReason, Place, TripPlan } from '../../domain/routing/itinerary.js';
import type { FeedInfo } from '../../application/use-cases/get-feed-info.js';
import type { GeocodeResult as GeocodeResultDto, GtfsInfoDto, ItineraryDto, LegDto, PlaceDto, PlanResponse } from './dto.js';

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
  return res;
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
  };
}

export function toGeocodeResultDto(r: GeocodeResult): GeocodeResultDto {
  const dto: GeocodeResultDto = { label: r.label, lat: r.lat, lon: r.lon, kind: r.kind };
  if (r.secondary !== undefined) dto.secondary = r.secondary;
  return dto;
}
