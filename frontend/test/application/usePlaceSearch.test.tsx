import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_SEARCH_CHARS, SEARCH_DEBOUNCE_MS, usePlaceSearch } from '../../src/application/hooks/usePlaceSearch';
import { fakeApi, geoResult as place, servicesWrapper } from '../fixtures';

interface Props {
  input: string;
  label?: string;
  focus?: { lat: number; lon: number };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(api = fakeApi()) {
  const hook = renderHook(
    ({ input, label, focus }: Props) =>
      usePlaceSearch(input, label, focus),
    { wrapper: servicesWrapper({ api }), initialProps: { input: '' } as Props },
  );
  return { ...hook, api };
}

describe('usePlaceSearch', () => {
  it(`no busca con menos de ${MIN_SEARCH_CHARS} letras`, async () => {
    const { result, rerender, api } = setup();
    rerender({ input: 'so' });
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2));
    expect(api.geocodeSearch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ results: [], loading: false, warning: undefined, typing: false });
  });

  it('espera a que se deje de escribir y busca una sola vez', async () => {
    const api = fakeApi({ geocodeSearch: vi.fn(async () => ({ results: [place('Sol')], warning: 'aviso' })) });
    const { result, rerender } = setup(api);
    rerender({ input: 'sol' });
    expect(result.current.loading).toBe(true);
    expect(result.current.typing).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(100));
    rerender({ input: 'sol m' });
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    expect(api.geocodeSearch).toHaveBeenCalledTimes(1);
    expect(api.geocodeSearch).toHaveBeenCalledWith('sol m', undefined, expect.any(AbortSignal));
    expect(result.current.results).toEqual([place('Sol')]);
    expect(result.current.warning).toBe('aviso');
    expect(result.current.loading).toBe(false);
  });

  it('pasa el foco y recorta espacios', async () => {
    const { rerender, api } = setup();
    rerender({ input: '  museo  ', focus: { lat: 1, lon: 2 } });
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    expect(api.geocodeSearch).toHaveBeenCalledWith('museo', { lat: 1, lon: 2 }, expect.any(AbortSignal));
  });

  it('no busca si el texto es el del lugar ya elegido', async () => {
    const { result, rerender, api } = setup();
    rerender({ input: 'Plaza Mayor', label: 'Plaza Mayor' });
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    expect(api.geocodeSearch).not.toHaveBeenCalled();
    expect(result.current.typing).toBe(false);
  });

  it('cancela la búsqueda anterior al seguir escribiendo', async () => {
    let firstSignal: AbortSignal | undefined;
    const api = fakeApi();
    api.geocodeSearch.mockImplementationOnce((_q: string, _f?: unknown, signal?: AbortSignal) => {
      firstSignal = signal;
      return new Promise(() => {});
    });
    const { rerender } = setup(api);
    rerender({ input: 'sol' });
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    rerender({ input: 'sola' });
    expect(firstSignal?.aborted).toBe(true);
  });

  it('si falla deja la lista vacía (salvo cancelaciones)', async () => {
    const api = fakeApi();
    api.geocodeSearch.mockRejectedValueOnce(new Error('500'));
    const { result, rerender } = setup(api);
    rerender({ input: 'sol' });
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);

    api.geocodeSearch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    rerender({ input: 'sola' });
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    expect(result.current.loading).toBe(true);
  });

  it('borrar el texto limpia los resultados', async () => {
    const api = fakeApi({ geocodeSearch: vi.fn(async () => ({ results: [place('Sol')] })) });
    const { result, rerender } = setup(api);
    rerender({ input: 'sol' });
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
    expect(result.current.results).toHaveLength(1);
    rerender({ input: '' });
    expect(result.current.results).toEqual([]);
  });
});
