import type {
  GeocodeReverseResponse,
  GeocodeSearchResponse,
  GtfsInfoDto,
  LatLon,
  PlanRequest,
  PlanResponse,
  VehiclesResponse,
} from '../../domain/types/api';

/** Acceso a la API del backend (calculadora de rutas y geocodificación). */
export interface TransitApi {
  gtfsInfo(signal?: AbortSignal): Promise<GtfsInfoDto>;
  plan(body: PlanRequest, signal?: AbortSignal): Promise<PlanResponse>;
  geocodeSearch(q: string, focus?: LatLon, signal?: AbortSignal): Promise<GeocodeSearchResponse>;
  geocodeReverse(p: LatLon, signal?: AbortSignal): Promise<GeocodeReverseResponse>;
  /** Posición en tiempo real de los vehículos que hacen esos viajes. */
  vehicles(tripIds: string[], signal?: AbortSignal): Promise<VehiclesResponse>;
}
