import type { GeocoderProvider, SearchOptions } from '../../application/ports/geocoder-provider.js';
import type { LatLon } from '../../domain/geo/geo.js';
import type { GeocodeResult } from '../../domain/geocoding/place.js';
import { joinUnique } from '../../domain/geocoding/text.js';
import { getJson } from '../http/http-utils.js';
import type { ProviderHttpOptions } from './photon-provider.js';

export interface NominatimItem {
  lat?: string;
  lon?: string;
  name?: string;
  category?: string;
  type?: string;
  addresstype?: string;
  display_name?: string;
  address?: Record<string, string>;
  error?: string;
}

export interface NominatimOptions extends ProviderHttpOptions {
  minIntervalMs: number;
  /** Peticiones que pueden esperar turno a la vez; el resto se rechaza al momento. */
  maxQueue?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class GeocoderBusyError extends Error {
  constructor() {
    super('Demasiadas peticiones pendientes al geocodificador');
    this.name = 'GeocoderBusyError';
  }
}

const DEFAULT_MAX_QUEUE = 20;

/**
 * Nominatim (https://nominatim.org). El servidor público exige máximo 1 petición/segundo
 * y no permite autocompletado intensivo; mejor usarlo con una instancia propia.
 */
export class NominatimProvider implements GeocoderProvider {
  readonly name = 'nominatim';
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private lastRequest = -Infinity;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly opts: NominatimOptions,
  ) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
  }

  async search(query: string, opts: SearchOptions): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: String(opts.limit),
      'accept-language': opts.language,
    });
    if (opts.bounds) {
      const b = opts.bounds;
      params.set('viewbox', [b.minLon, b.maxLat, b.maxLon, b.minLat].join(','));
      params.set('bounded', '1');
    }
    const items = await this.get<unknown>(`/search?${params}`);
    if (!Array.isArray(items)) return [];
    return (items as NominatimItem[]).map(nominatimToResult).filter((r): r is GeocodeResult => r !== null);
  }

  async reverse(point: LatLon, language: string): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({
      lat: String(point.lat),
      lon: String(point.lon),
      format: 'jsonv2',
      addressdetails: '1',
      'accept-language': language,
    });
    const item = await this.get<NominatimItem>(`/reverse?${params}`);
    if (!item || item.error) return null;
    const r = nominatimToResult(item);
    return r ? { ...r, lat: point.lat, lon: point.lon } : null;
  }

  /** Serializa las peticiones respetando el intervalo mínimo entre ellas. */
  private get<T>(path: string): Promise<T> {
    if (this.pending >= (this.opts.maxQueue ?? DEFAULT_MAX_QUEUE)) return Promise.reject(new GeocoderBusyError());
    this.pending++;
    const run = async () => {
      const wait = this.lastRequest + this.opts.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequest = this.now();
      return getJson<T>({
        url: `${this.baseUrl.replace(/\/$/, '')}${path}`,
        userAgent: this.userAgent,
        timeoutMs: this.opts.timeoutMs ?? 8000,
        maxBytes: this.opts.maxBytes ?? 2 * 1024 * 1024,
        service: 'Nominatim',
        fetchFn: this.opts.fetchFn,
      });
    };
    const next = this.queue.then(run, run).finally(() => this.pending--);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** Convierte un resultado de Nominatim; null si no tiene coordenadas válidas. */
export function nominatimToResult(item: NominatimItem): GeocodeResult | null {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (item.lat === undefined || item.lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const a = item.address ?? {};
  const street = joinUnique([a.road ?? a.pedestrian, a.house_number])?.replace(', ', ' ');
  const city = a.city ?? a.town ?? a.village;
  const label = item.name || street || item.display_name?.split(',')[0] || 'Ubicación';
  return {
    label,
    secondary: joinUnique([item.name ? street : undefined, a.suburb ?? a.neighbourhood, city]),
    lat,
    lon,
    kind: item.addresstype === 'road' ? 'street' : item.name ? 'poi' : 'address',
  };
}
