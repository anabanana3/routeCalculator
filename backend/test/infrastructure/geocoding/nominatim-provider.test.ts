import { describe, expect, it, vi } from 'vitest';
import {
  GeocoderBusyError,
  NominatimProvider,
  nominatimToResult,
  type NominatimOptions,
} from '../../../src/infrastructure/geocoding/nominatim-provider.js';

const item = {
  lat: '40.4',
  lon: '-3.7',
  name: 'Museo',
  addresstype: 'tourism',
  display_name: 'Museo, Calle Mayor, Elche',
  address: { road: 'Calle Mayor', house_number: '3', suburb: 'Centro', city: 'Elche' },
};

function provider(body: unknown, opts: Partial<NominatimOptions> = {}, status = 200) {
  const fetchFn = vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify(body), { status }));
  const nominatim = new NominatimProvider('https://nominatim.test', 'ua/1', {
    minIntervalMs: 0,
    fetchFn: fetchFn as typeof fetch,
    ...opts,
  });
  return { nominatim, fetchFn };
}

describe('nominatimToResult', () => {
  it('lugar con nombre', () => {
    expect(nominatimToResult(item)).toEqual({
      label: 'Museo',
      secondary: 'Calle Mayor 3, Centro, Elche',
      lat: 40.4,
      lon: -3.7,
      kind: 'poi',
    });
  });

  it('calle y dirección sin nombre', () => {
    expect(nominatimToResult({ ...item, name: '', addresstype: 'road' })).toMatchObject({ label: 'Calle Mayor 3', kind: 'street' });
    expect(nominatimToResult({ lat: '1', lon: '2', display_name: 'Algo, Sitio', address: { town: 'Pueblo' } })).toEqual({
      label: 'Algo',
      secondary: 'Pueblo',
      lat: 1,
      lon: 2,
      kind: 'address',
    });
  });

  it('etiqueta por defecto si no hay nada', () => {
    expect(nominatimToResult({ lat: '1', lon: '2' })!.label).toBe('Ubicación');
  });

  it('descarta coordenadas inválidas', () => {
    expect(nominatimToResult({ ...item, lat: 'abc' })).toBeNull();
    expect(nominatimToResult({ name: 'x' })).toBeNull();
  });
});

describe('NominatimProvider', () => {
  it('search construye la URL con idioma y caja limitada', async () => {
    const { nominatim, fetchFn } = provider([item, { lat: 'x' }]);
    const res = await nominatim.search('museo', {
      limit: 3,
      language: 'es',
      bounds: { minLat: 40, minLon: -4, maxLat: 41, maxLon: -3 },
    });
    expect(res.map((r) => r.label)).toEqual(['Museo']);
    const url = new URL(String(fetchFn.mock.calls[0][0]));
    expect(url.pathname).toBe('/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'museo',
      format: 'jsonv2',
      addressdetails: '1',
      limit: '3',
      'accept-language': 'es',
      viewbox: '-4,41,-3,40',
      bounded: '1',
    });
  });

  it('search tolera respuestas que no son una lista', async () => {
    expect(await provider({ error: 'x' }).nominatim.search('a', { limit: 1, language: 'es' })).toEqual([]);
  });

  it('reverse usa las coordenadas pedidas', async () => {
    const { nominatim, fetchFn } = provider({ ...item, lat: '9', lon: '9' });
    expect(await nominatim.reverse({ lat: 40.41, lon: -3.71 }, 'en')).toMatchObject({ label: 'Museo', lat: 40.41, lon: -3.71 });
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('accept-language')).toBe('en');
  });

  it('reverse devuelve null si Nominatim responde con error o datos inválidos', async () => {
    expect(await provider({ error: 'Unable to geocode' }).nominatim.reverse({ lat: 0, lon: 0 }, 'es')).toBeNull();
    expect(await provider(null).nominatim.reverse({ lat: 0, lon: 0 }, 'es')).toBeNull();
    expect(await provider({ name: 'sin coords' }).nominatim.reverse({ lat: 0, lon: 0 }, 'es')).toBeNull();
  });

  it('respeta el intervalo mínimo entre peticiones', async () => {
    let t = 1000;
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const { nominatim } = provider([], { minIntervalMs: 1000, now: () => t, sleep });
    await nominatim.search('a', { limit: 1, language: 'es' });
    expect(sleep).not.toHaveBeenCalled();
    t += 200;
    await nominatim.search('b', { limit: 1, language: 'es' });
    expect(sleep).toHaveBeenCalledWith(800);
  });

  it('serializa peticiones y sigue funcionando tras un error', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('[]'));
    const nominatim = new NominatimProvider('https://nominatim.test/', 'ua', { minIntervalMs: 0, fetchFn });
    const a = nominatim.search('a', { limit: 1, language: 'es' });
    const b = nominatim.search('b', { limit: 1, language: 'es' });
    await expect(a).rejects.toThrow('Nominatim respondió HTTP 500');
    await expect(b).resolves.toEqual([]);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/^https:\/\/nominatim\.test\/search\?/);
  });

  it('rechaza peticiones si la cola está llena (evita colgar el servidor)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchFn = vi.fn(async () => {
      await gate;
      return new Response('[]');
    });
    const nominatim = new NominatimProvider('https://n.test', 'ua', { minIntervalMs: 0, maxQueue: 2, fetchFn: fetchFn as typeof fetch });
    const first = nominatim.search('1', { limit: 1, language: 'es' });
    const second = nominatim.search('2', { limit: 1, language: 'es' });
    await expect(nominatim.search('3', { limit: 1, language: 'es' })).rejects.toBeInstanceOf(GeocoderBusyError);
    release();
    await Promise.all([first, second]);
    await expect(nominatim.search('4', { limit: 1, language: 'es' })).resolves.toEqual([]);
  });
});
