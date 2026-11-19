import type { LatLon } from '../../domain/geo/geo.js';
import { dedupeResults, type GeocodeResult, type PlaceSearchResult } from '../../domain/geocoding/place.js';
import { searchBounds, searchFocus } from '../../domain/geocoding/search-area.js';
import { StopSearchIndex } from '../../domain/geocoding/stop-search.js';
import type { TransitNetwork } from '../../domain/network/model.js';
import { type Cache, cached } from '../ports/cache.js';
import type { GeocoderProvider } from '../ports/geocoder-provider.js';
import { type Logger, silentLogger } from '../ports/logger.js';
import type { NetworkProvider } from '../ports/network-provider.js';
import { memoizeLast } from '../services/memoize-last.js';

export interface SearchPlacesOptions {
  language: string;
  restrictToGtfsBounds: boolean;
  boundsMarginMeters: number;
}

export interface SearchPlacesQuery {
  q: string;
  limit: number;
  focus?: LatLon;
}

/** Máximo de paradas del GTFS que se añaden a los resultados del proveedor. */
export const MAX_STOP_RESULTS = 3;

export const PROVIDER_UNAVAILABLE_WARNING = 'El buscador de direcciones no está disponible; solo se muestran paradas';

/** Caso de uso: buscar direcciones, calles, lugares y paradas. */
export class SearchPlacesUseCase {
  private readonly indexFor = memoizeLast((network: TransitNetwork) => new StopSearchIndex(network));

  constructor(
    private readonly provider: GeocoderProvider,
    private readonly cache: Cache<GeocodeResult[]>,
    private readonly networks: NetworkProvider,
    private readonly opts: SearchPlacesOptions,
    private readonly logger: Logger = silentLogger,
  ) {}

  async execute({ q, limit, focus }: SearchPlacesQuery): Promise<PlaceSearchResult> {
    const query = q.trim();
    const network = this.networks.current;
    const stops = network ? this.indexFor(network).search(query, Math.min(MAX_STOP_RESULTS, limit)) : [];
    const bounds = network?.bounds ?? null;
    const cacheKey = `${query.toLowerCase()}|${limit}|${focus ? `${focus.lat.toFixed(3)},${focus.lon.toFixed(3)}` : ''}`;
    try {
      const places = await cached(this.cache, cacheKey, () =>
        this.provider.search(query, {
          limit,
          focus: searchFocus(focus, bounds),
          bounds: searchBounds(bounds, this.opts.restrictToGtfsBounds, this.opts.boundsMarginMeters),
          language: this.opts.language,
        }),
      );
      return { results: [...dedupeResults(places), ...stops] };
    } catch (err) {
      this.logger.warn(`Fallo buscando en ${this.provider.name}: ${(err as Error).message}`);
      return { results: stops, warning: PROVIDER_UNAVAILABLE_WARNING };
    }
  }
}
