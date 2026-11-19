import type { GeocoderProvider, SearchOptions } from '../../application/ports/geocoder-provider.js';
import type { LatLon } from '../../domain/geo/geo.js';
import type { GeocodeKind, GeocodeResult } from '../../domain/geocoding/place.js';
import { joinUnique } from '../../domain/geocoding/text.js';
import { type FetchFn, getJson } from '../http/http-utils.js';

export interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    locality?: string;
    district?: string;
    city?: string;
    state?: string;
    type?: string;
    osm_key?: string;
    osm_value?: string;
  };
}

export interface ProviderHttpOptions {
  timeoutMs?: number;
  maxBytes?: number;
  fetchFn?: FetchFn;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Photon (https://photon.komoot.io): geocodificador sobre OpenStreetMap con soporte de autocompletado. */
export class PhotonProvider implements GeocoderProvider {
  readonly name = 'photon';

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly http: ProviderHttpOptions = {},
  ) {}

  async search(query: string, opts: SearchOptions): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({ q: query, limit: String(opts.limit) });
    if (opts.focus) {
      params.set('lat', String(opts.focus.lat));
      params.set('lon', String(opts.focus.lon));
    }
    if (opts.bounds) {
      const b = opts.bounds;
      params.set('bbox', [b.minLon, b.minLat, b.maxLon, b.maxLat].join(','));
    }
    const features = await this.get(`/api/?${params}`);
    // Las paradas de OSM se descartan: ya se devuelven las del GTFS, que son las que usa el cálculo.
    return features
      .filter((f) => !isTransitStop(f))
      .map(photonToResult)
      .filter((r): r is GeocodeResult => r !== null);
  }

  async reverse(point: LatLon): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), limit: '1' });
    const features = await this.get(`/reverse?${params}`);
    const r = features[0] ? photonToResult(features[0]) : null;
    return r ? { ...r, lat: point.lat, lon: point.lon } : null;
  }

  private async get(path: string): Promise<PhotonFeature[]> {
    const data = await getJson<{ features?: unknown }>({
      url: `${this.baseUrl.replace(/\/$/, '')}${path}`,
      userAgent: this.userAgent,
      timeoutMs: this.http.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBytes: this.http.maxBytes ?? DEFAULT_MAX_BYTES,
      service: 'Photon',
      fetchFn: this.http.fetchFn,
    });
    return Array.isArray(data?.features) ? (data.features as PhotonFeature[]) : [];
  }
}

export function isTransitStop(f: PhotonFeature): boolean {
  const { osm_key: key, osm_value: value } = f.properties ?? {};
  return (
    (key === 'highway' && value === 'bus_stop') ||
    (key === 'public_transport' && (value === 'platform' || value === 'stop_position')) ||
    (key === 'railway' && (value === 'tram_stop' || value === 'platform'))
  );
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

/** Convierte un resultado de Photon; null si no tiene coordenadas válidas. */
export function photonToResult(f: PhotonFeature): GeocodeResult | null {
  const coords = f.geometry?.coordinates;
  if (!Array.isArray(coords) || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  const p = f.properties ?? {};
  const name = str(p.name);
  const street = str(p.street);
  const streetLine = street ? joinUnique([street, str(p.housenumber)])?.replace(', ', ' ') : undefined;
  const label = name ?? streetLine ?? str(p.city) ?? 'Ubicación';
  const kind: GeocodeKind =
    p.type === 'street' ? 'street' : name && p.osm_key !== 'place' && p.osm_key !== 'building' ? 'poi' : 'address';
  return {
    label,
    secondary: joinUnique([name ? streetLine : undefined, str(p.locality) ?? str(p.district), str(p.city)]),
    lat: coords[1] as number,
    lon: coords[0] as number,
    kind,
  };
}
