import { vi } from 'vitest';
import type { Cache } from '../../src/application/ports/cache.js';
import type { GeocoderProvider, SearchOptions } from '../../src/application/ports/geocoder-provider.js';
import type { Logger } from '../../src/application/ports/logger.js';
import type { LatLon } from '../../src/domain/geo/geo.js';
import type { GeocodeResult } from '../../src/domain/geocoding/place.js';

export class MapCache<T> implements Cache<T> {
  readonly map = new Map<string, T>();
  get(key: string) {
    return this.map.get(key);
  }
  set(key: string, value: T) {
    this.map.set(key, value);
  }
  clear() {
    this.map.clear();
  }
}

export function fakeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies Logger;
}

export function fakeGeocoder(results: GeocodeResult[] = [], reverse: GeocodeResult | null = null) {
  return {
    name: 'fake',
    search: vi.fn(async (_query: string, _opts: SearchOptions) => results),
    reverse: vi.fn(async (_point: LatLon, _language: string) => reverse),
  } satisfies GeocoderProvider;
}

export const place = (label: string, extra: Partial<GeocodeResult> = {}): GeocodeResult => ({
  label,
  lat: 1,
  lon: 2,
  kind: 'address',
  ...extra,
});
