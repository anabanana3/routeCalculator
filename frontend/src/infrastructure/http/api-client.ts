import type { TransitApi } from '../../application/ports/transit-api';
import type {
  GeocodeReverseResponse,
  GeocodeSearchResponse,
  GtfsInfoDto,
  PlanResponse,
  VehiclesResponse,
} from '../../domain/types/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchFn = typeof fetch;

/** Implementación HTTP del puerto TransitApi. */
export function createHttpTransitApi(baseUrl: string, fetchFn: FetchFn = (...args) => fetch(...args)): TransitApi {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!res.ok) {
      let message = `Error ${res.status}`;
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === 'string' && body.error) message = body.error;
      } catch {
        // respuesta sin JSON
      }
      throw new ApiError(message, res.status);
    }
    return (await res.json()) as T;
  }

  return {
    gtfsInfo: (signal) => request<GtfsInfoDto>('/api/gtfs', { signal }),
    plan: (body, signal) => request<PlanResponse>('/api/plan', { method: 'POST', body: JSON.stringify(body), signal }),
    geocodeSearch: (q, focus, signal) => {
      const params = new URLSearchParams({ q });
      if (focus) {
        params.set('lat', String(focus.lat));
        params.set('lon', String(focus.lon));
      }
      return request<GeocodeSearchResponse>(`/api/geocode/search?${params}`, { signal });
    },
    geocodeReverse: (p, signal) => {
      const params = new URLSearchParams({ lat: String(p.lat), lon: String(p.lon) });
      return request<GeocodeReverseResponse>(`/api/geocode/reverse?${params}`, { signal });
    },
    vehicles: (tripIds, signal) => {
      const params = new URLSearchParams({ tripIds: tripIds.join(',') });
      return request<VehiclesResponse>(`/api/realtime/vehicles?${params}`, { signal });
    },
  };
}
