import type {
  GeocodeReverseResponse,
  GeocodeSearchResponse,
  GtfsInfoDto,
  LatLon,
  PlanRequest,
  PlanResponse,
} from '../../domain/types/api';

/** Acceso a la API del backend (calculadora de rutas y geocodificación). */
export interface TransitApi {
  gtfsInfo(signal?: AbortSignal): Promise<GtfsInfoDto>;
  plan(body: PlanRequest, signal?: AbortSignal): Promise<PlanResponse>;
  geocodeSearch(q: string, focus?: LatLon, signal?: AbortSignal): Promise<GeocodeSearchResponse>;
  geocodeReverse(p: LatLon, signal?: AbortSignal): Promise<GeocodeReverseResponse>;
}
