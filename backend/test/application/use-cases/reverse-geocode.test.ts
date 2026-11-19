import { beforeAll, describe, expect, it } from 'vitest';
import { ReverseGeocodeUseCase } from '../../../src/application/use-cases/reverse-geocode.js';
import type { GeocodeResult } from '../../../src/domain/geocoding/place.js';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { buildTestNetwork, near, STOPS } from '../../fixtures/network.js';
import { fakeGeocoder, fakeLogger, MapCache, place } from '../../fixtures/fakes.js';

let network: TransitNetwork;
beforeAll(async () => {
  network = await buildTestNetwork();
});

describe('ReverseGeocodeUseCase', () => {
  it('si el punto está sobre una parada devuelve la parada sin llamar al proveedor', async () => {
    const geocoder = fakeGeocoder();
    const uc = new ReverseGeocodeUseCase(geocoder, new MapCache(), { current: network }, 'es');
    const p = near(STOPS.C, 5);
    expect(await uc.execute(p)).toMatchObject({ label: 'Estación Central', kind: 'stop', lat: p.lat, lon: p.lon });
    expect(geocoder.reverse).not.toHaveBeenCalled();
  });

  it('si no, pregunta al proveedor y cachea por coordenadas redondeadas', async () => {
    const geocoder = fakeGeocoder([], place('Calle Real 5'));
    const uc = new ReverseGeocodeUseCase(geocoder, new MapCache<GeocodeResult | null>(), { current: network }, 'es');
    const p = { lat: 40.402, lon: -3.697 };
    expect(await uc.execute(p)).toEqual(place('Calle Real 5'));
    await uc.execute({ lat: 40.402000001, lon: -3.697000001 });
    expect(geocoder.reverse).toHaveBeenCalledTimes(1);
    expect(geocoder.reverse).toHaveBeenCalledWith(p, 'es');
  });

  it('devuelve null si el proveedor falla', async () => {
    const geocoder = fakeGeocoder();
    geocoder.reverse.mockRejectedValue(new Error('timeout'));
    const logger = fakeLogger();
    const uc = new ReverseGeocodeUseCase(geocoder, new MapCache(), { current: network }, 'es', logger);
    expect(await uc.execute({ lat: 0, lon: 0 })).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('Fallo en geocodificación inversa: timeout');
  });

  it('funciona sin red cargada', async () => {
    const geocoder = fakeGeocoder([], null);
    const uc = new ReverseGeocodeUseCase(geocoder, new MapCache(), { current: null }, 'es');
    expect(await uc.execute(STOPS.C)).toBeNull();
    expect(geocoder.reverse).toHaveBeenCalled();
  });
});
