import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PROVIDER_UNAVAILABLE_WARNING,
  SearchPlacesUseCase,
  type SearchPlacesOptions,
} from '../../../src/application/use-cases/search-places.js';
import { expandBounds } from '../../../src/domain/geo/geo.js';
import type { GeocodeResult } from '../../../src/domain/geocoding/place.js';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { buildTestNetwork } from '../../fixtures/network.js';
import { fakeGeocoder, fakeLogger, MapCache, place } from '../../fixtures/fakes.js';

const OPTS: SearchPlacesOptions = { language: 'es', restrictToGtfsBounds: true, boundsMarginMeters: 1000 };

let network: TransitNetwork;
beforeAll(async () => {
  network = await buildTestNetwork();
});

describe('SearchPlacesUseCase', () => {
  it('combina resultados del proveedor (sin duplicados) con paradas del GTFS', async () => {
    const geocoder = fakeGeocoder([place('Calle Mayor', { secondary: 'Elche' }), place('calle mayor', { secondary: 'elche' })]);
    const uc = new SearchPlacesUseCase(geocoder, new MapCache(), { current: network }, OPTS);
    const res = await uc.execute({ q: ' Plaza ', limit: 6 });
    expect(res.warning).toBeUndefined();
    expect(res.results.map((r) => r.label)).toEqual(['Calle Mayor', 'Plaza Mayor']);
    expect(res.results[1].kind).toBe('stop');
  });

  it('pasa al proveedor el foco, los límites ampliados y el idioma', async () => {
    const geocoder = fakeGeocoder();
    const uc = new SearchPlacesUseCase(geocoder, new MapCache(), { current: network }, OPTS);
    await uc.execute({ q: 'mayor', limit: 4, focus: { lat: 1, lon: 2 } });
    expect(geocoder.search).toHaveBeenCalledWith('mayor', {
      limit: 4,
      focus: { lat: 1, lon: 2 },
      bounds: expandBounds(network.bounds!, 1000),
      language: 'es',
    });
  });

  it('sin foco prioriza el centro de la red', async () => {
    const geocoder = fakeGeocoder();
    const uc = new SearchPlacesUseCase(geocoder, new MapCache(), { current: network }, { ...OPTS, restrictToGtfsBounds: false });
    await uc.execute({ q: 'mayor', limit: 4 });
    const opts = geocoder.search.mock.calls[0][1];
    expect(opts.focus!.lat).toBeCloseTo(40.405, 10);
    expect(opts.bounds).toBeUndefined();
  });

  it('limita las paradas añadidas', async () => {
    const uc = new SearchPlacesUseCase(fakeGeocoder(), new MapCache(), { current: network }, OPTS);
    expect((await uc.execute({ q: 'a', limit: 10 })).results).toHaveLength(3);
    expect((await uc.execute({ q: 'a', limit: 1 })).results).toHaveLength(1);
  });

  it('cachea las respuestas del proveedor', async () => {
    const geocoder = fakeGeocoder([place('Calle Mayor')]);
    const cache = new MapCache<GeocodeResult[]>();
    const uc = new SearchPlacesUseCase(geocoder, cache, { current: network }, OPTS);
    await uc.execute({ q: 'Mayor', limit: 6, focus: { lat: 40.12345, lon: -3.98765 } });
    await uc.execute({ q: 'mayor ', limit: 6, focus: { lat: 40.1234, lon: -3.9877 } });
    expect(geocoder.search).toHaveBeenCalledTimes(1);
    await uc.execute({ q: 'mayor', limit: 5 });
    expect(geocoder.search).toHaveBeenCalledTimes(2);
  });

  it('si el proveedor falla devuelve solo paradas con un aviso (sin registrar la búsqueda)', async () => {
    const geocoder = fakeGeocoder();
    geocoder.search.mockRejectedValue(new Error('HTTP 503'));
    const logger = fakeLogger();
    const uc = new SearchPlacesUseCase(geocoder, new MapCache(), { current: network }, OPTS, logger);
    const res = await uc.execute({ q: 'estacion secreta', limit: 6 });
    expect(res).toEqual({ results: [], warning: PROVIDER_UNAVAILABLE_WARNING });
    expect(logger.warn).toHaveBeenCalledWith('Fallo buscando en fake: HTTP 503');
    expect(String(logger.warn.mock.calls[0][0])).not.toContain('secreta');
  });

  it('funciona sin red cargada', async () => {
    const geocoder = fakeGeocoder([place('Sol')]);
    const uc = new SearchPlacesUseCase(geocoder, new MapCache(), { current: null }, OPTS);
    expect((await uc.execute({ q: 'sol', limit: 6 })).results.map((r) => r.label)).toEqual(['Sol']);
    expect(geocoder.search).toHaveBeenCalledWith('sol', expect.objectContaining({ focus: undefined, bounds: undefined }));
  });

  it('reconstruye el índice de paradas al cambiar de red', async () => {
    const provider: { current: TransitNetwork | null } = { current: network };
    const uc = new SearchPlacesUseCase(fakeGeocoder(), new MapCache(), provider, OPTS);
    expect((await uc.execute({ q: 'hospital', limit: 6 })).results).toHaveLength(1);
    provider.current = await buildTestNetwork({}, { agency: [] });
    expect((await uc.execute({ q: 'hospital', limit: 6 })).results).toHaveLength(0);
    vi.restoreAllMocks();
  });
});
