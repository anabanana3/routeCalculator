import { describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpTransitApi } from '../../src/infrastructure/http/api-client';
import { GTFS_INFO, PLAN } from '../fixtures';

function setup(body: unknown = {}, status = 200) {
  const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  return { fetchFn, api: createHttpTransitApi('https://api.test', fetchFn) };
}

describe('createHttpTransitApi', () => {
  it('gtfsInfo hace GET /api/gtfs', async () => {
    const { api, fetchFn } = setup(GTFS_INFO);
    const signal = new AbortController().signal;
    expect(await api.gtfsInfo(signal)).toEqual(GTFS_INFO);
    expect(fetchFn).toHaveBeenCalledWith('https://api.test/api/gtfs', {
      signal,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('plan hace POST con el cuerpo en JSON', async () => {
    const { api, fetchFn } = setup(PLAN);
    const body = { from: { lat: 1, lon: 2 }, to: { lat: 3, lon: 4 } };
    expect(await api.plan(body)).toEqual(PLAN);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.test/api/plan');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(body) });
  });

  it('geocodeSearch codifica la consulta (sin inyección de parámetros)', async () => {
    const { api, fetchFn } = setup({ results: [] });
    await api.geocodeSearch('calle & limit=99', { lat: 40.4, lon: -3.7 });
    const url = new URL(String(fetchFn.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/geocode/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'calle & limit=99', lat: '40.4', lon: '-3.7' });
  });

  it('geocodeSearch sin foco', async () => {
    const { api, fetchFn } = setup({ results: [] });
    await api.geocodeSearch('sol');
    expect(String(fetchFn.mock.calls[0][0])).toBe('https://api.test/api/geocode/search?q=sol');
  });

  it('geocodeReverse envía las coordenadas', async () => {
    const { api, fetchFn } = setup({ result: null });
    expect(await api.geocodeReverse({ lat: 40.4, lon: -3.7 })).toEqual({ result: null });
    expect(String(fetchFn.mock.calls[0][0])).toBe('https://api.test/api/geocode/reverse?lat=40.4&lon=-3.7');
  });

  it('usa el mensaje de error del servidor', async () => {
    const { api } = setup({ error: 'Los datos GTFS todavía no están cargados' }, 503);
    const err = await api.gtfsInfo().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'Los datos GTFS todavía no están cargados', status: 503 });
  });

  it('mensaje genérico si la respuesta de error no es JSON o no trae texto', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('<html>', { status: 502 }));
    await expect(createHttpTransitApi('', fetchFn).gtfsInfo()).rejects.toThrow('Error 502');
    await expect(setup({ error: { evil: true } }, 500).api.gtfsInfo()).rejects.toThrow('Error 500');
  });

  it('usa fetch global por defecto', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await createHttpTransitApi('').gtfsInfo();
    expect(spy).toHaveBeenCalledWith('/api/gtfs', expect.anything());
  });
});
