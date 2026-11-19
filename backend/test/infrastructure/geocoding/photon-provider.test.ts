import { describe, expect, it, vi } from 'vitest';
import {
  isTransitStop,
  type PhotonFeature,
  PhotonProvider,
  photonToResult,
} from '../../../src/infrastructure/geocoding/photon-provider.js';

const feature = (properties: PhotonFeature['properties'], coordinates: unknown = [-3.7, 40.4]): PhotonFeature => ({
  geometry: { coordinates },
  properties,
});

function provider(body: unknown, status = 200) {
  const fetchFn = vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify(body), { status }));
  return { fetchFn, photon: new PhotonProvider('https://photon.test/', 'ua/1', { fetchFn: fetchFn as typeof fetch }) };
}

describe('photonToResult', () => {
  it('lugar con nombre: poi con calle y ciudad como secundario', () => {
    expect(photonToResult(feature({ name: 'Museo', street: 'Calle Mayor', housenumber: '3', city: 'Elche', osm_key: 'tourism' }))).toEqual({
      label: 'Museo',
      secondary: 'Calle Mayor 3, Elche',
      lat: 40.4,
      lon: -3.7,
      kind: 'poi',
    });
  });

  it('dirección sin nombre: la calle es la etiqueta', () => {
    expect(photonToResult(feature({ street: 'Calle Mayor', housenumber: '3', district: 'Centro', city: 'Elche' }))).toMatchObject({
      label: 'Calle Mayor 3',
      secondary: 'Centro, Elche',
      kind: 'address',
    });
  });

  it('calles, lugares y edificios', () => {
    expect(photonToResult(feature({ name: 'Calle Mayor', type: 'street' }))!.kind).toBe('street');
    expect(photonToResult(feature({ name: 'Elche', osm_key: 'place' }))!.kind).toBe('address');
    expect(photonToResult(feature({ name: 'Torre', osm_key: 'building' }))!.kind).toBe('address');
  });

  it('etiqueta por defecto', () => {
    expect(photonToResult(feature({ city: 'Elche' }))!.label).toBe('Elche');
    expect(photonToResult(feature({}))!.label).toBe('Ubicación');
    expect(photonToResult({ geometry: { coordinates: [1, 2] } })!.label).toBe('Ubicación');
  });

  it('descarta resultados sin coordenadas válidas', () => {
    expect(photonToResult(feature({ name: 'x' }, null))).toBeNull();
    expect(photonToResult(feature({ name: 'x' }, ['a', 'b']))).toBeNull();
    expect(photonToResult({})).toBeNull();
  });

  it('ignora propiedades que no son texto', () => {
    const r = photonToResult(feature({ name: 42 as unknown as string, city: 'Elche' }));
    expect(r!.label).toBe('Elche');
  });
});

describe('isTransitStop', () => {
  it.each([
    ['highway', 'bus_stop', true],
    ['public_transport', 'platform', true],
    ['public_transport', 'stop_position', true],
    ['railway', 'tram_stop', true],
    ['railway', 'platform', true],
    ['railway', 'station', false],
    ['amenity', 'cafe', false],
  ])('%s=%s -> %s', (osm_key, osm_value, expected) => {
    expect(isTransitStop(feature({ osm_key, osm_value }))).toBe(expected);
  });

  it('sin propiedades no es parada', () => {
    expect(isTransitStop({})).toBe(false);
  });
});

describe('PhotonProvider', () => {
  it('search construye la URL con foco y caja y descarta paradas de OSM', async () => {
    const { photon, fetchFn } = provider({
      features: [feature({ name: 'Parada', osm_key: 'highway', osm_value: 'bus_stop' }), feature({ name: 'Museo' })],
    });
    const results = await photon.search('museo & co', {
      limit: 5,
      language: 'es',
      focus: { lat: 40.4, lon: -3.7 },
      bounds: { minLat: 40, minLon: -4, maxLat: 41, maxLon: -3 },
    });
    expect(results.map((r) => r.label)).toEqual(['Museo']);
    const url = new URL(String(fetchFn.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://photon.test/api/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'museo & co',
      limit: '5',
      lat: '40.4',
      lon: '-3.7',
      bbox: '-4,40,-3,41',
    });
  });

  it('search sin foco ni caja', async () => {
    const { photon, fetchFn } = provider({ features: [] });
    await photon.search('x', { limit: 1, language: 'es' });
    expect(new URL(String(fetchFn.mock.calls[0][0])).search).toBe('?q=x&limit=1');
  });

  it('respuestas sin "features" se tratan como vacías', async () => {
    expect(await provider({}).photon.search('x', { limit: 1, language: 'es' })).toEqual([]);
    expect(await provider(null).photon.search('x', { limit: 1, language: 'es' })).toEqual([]);
  });

  it('reverse usa las coordenadas pedidas', async () => {
    const { photon, fetchFn } = provider({ features: [feature({ street: 'Calle Mayor' }, [-3.71, 40.41])] });
    expect(await photon.reverse({ lat: 40.4, lon: -3.7 })).toMatchObject({ label: 'Calle Mayor', lat: 40.4, lon: -3.7 });
    expect(String(fetchFn.mock.calls[0][0])).toBe('https://photon.test/reverse?lat=40.4&lon=-3.7&limit=1');
  });

  it('reverse devuelve null si no hay resultados', async () => {
    expect(await provider({ features: [] }).photon.reverse({ lat: 0, lon: 0 })).toBeNull();
    expect(await provider({ features: [{}] }).photon.reverse({ lat: 0, lon: 0 })).toBeNull();
  });

  it('propaga los errores HTTP', async () => {
    await expect(provider({}, 500).photon.search('x', { limit: 1, language: 'es' })).rejects.toThrow('Photon respondió HTTP 500');
  });
});
