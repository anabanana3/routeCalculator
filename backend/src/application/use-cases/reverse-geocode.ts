import type { LatLon } from '../../domain/geo/geo.js';
import type { GeocodeResult } from '../../domain/geocoding/place.js';
import { StopSearchIndex } from '../../domain/geocoding/stop-search.js';
import type { TransitNetwork } from '../../domain/network/model.js';
import { type Cache, cached } from '../ports/cache.js';
import type { GeocoderProvider } from '../ports/geocoder-provider.js';
import { type Logger, silentLogger } from '../ports/logger.js';
import type { NetworkProvider } from '../ports/network-provider.js';
import { memoizeLast } from '../services/memoize-last.js';

/** Si el punto está a menos de esta distancia de una parada, se usa el nombre de la parada. */
export const SNAP_TO_STOP_METERS = 25;

/** Caso de uso: nombre de un punto del mapa. */
export class ReverseGeocodeUseCase {
  private readonly indexFor = memoizeLast((network: TransitNetwork) => new StopSearchIndex(network));

  constructor(
    private readonly provider: GeocoderProvider,
    private readonly cache: Cache<GeocodeResult | null>,
    private readonly networks: NetworkProvider,
    private readonly language: string,
    private readonly logger: Logger = silentLogger,
  ) {}

  async execute(point: LatLon): Promise<GeocodeResult | null> {
    const network = this.networks.current;
    const stop = network ? this.indexFor(network).nearest(point, SNAP_TO_STOP_METERS) : null;
    if (stop) return stop;
    const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
    try {
      return await cached(this.cache, key, () => this.provider.reverse(point, this.language));
    } catch (err) {
      this.logger.warn(`Fallo en geocodificación inversa: ${(err as Error).message}`);
      return null;
    }
  }
}
