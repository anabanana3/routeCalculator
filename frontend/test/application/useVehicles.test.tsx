import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_VEHICLE_REFRESH_SECONDS, useVehicles } from '../../src/application/hooks/useVehicles';
import type { ItineraryDto, VehicleDto } from '../../src/domain/types/api';
import { fakeApi, NOW, servicesWrapper, TRANSIT_ITINERARY, WALK_ITINERARY } from '../fixtures';

const VEHICLE: VehicleDto = { tripId: 'T1', lat: 40.41, lon: -3.7 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

// waitFor usa setInterval, que aquí está simulado: se vacían las promesas a mano.
const flush = () => act(async () => {});

function setup(itinerary: ItineraryDto | null, refresh: number | null = 15, api = fakeApi({ vehicles: async () => ({ vehicles: [VEHICLE] }) })) {
  const hook = renderHook(({ it, r }) => useVehicles(it, r), {
    wrapper: servicesWrapper({ api }),
    initialProps: { it: itinerary, r: refresh },
  });
  return { ...hook, api };
}

describe('useVehicles', () => {
  it('pide las posiciones del itinerario y las refresca periódicamente', async () => {
    const { result, api } = setup(TRANSIT_ITINERARY);
    await flush();
    expect(result.current).toEqual([VEHICLE]);
    expect(api.vehicles).toHaveBeenCalledWith(['T1'], expect.any(AbortSignal));
    act(() => vi.advanceTimersByTime(15_000));
    expect(api.vehicles).toHaveBeenCalledTimes(2);
    // La petición anterior se cancela al lanzar la siguiente.
    expect(api.vehicles.mock.calls[0][1]!.aborted).toBe(true);
  });

  it('respeta un intervalo mínimo', () => {
    const { api } = setup(TRANSIT_ITINERARY, 1);
    act(() => vi.advanceTimersByTime(MIN_VEHICLE_REFRESH_SECONDS * 1000 - 1));
    expect(api.vehicles).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(api.vehicles).toHaveBeenCalledTimes(2);
  });

  it('no pide nada sin tiempo real, sin tramos en vehículo o para itinerarios lejanos', () => {
    expect(setup(TRANSIT_ITINERARY, null).api.vehicles).not.toHaveBeenCalled();
    expect(setup(WALK_ITINERARY).api.vehicles).not.toHaveBeenCalled();
    expect(setup(null).api.vehicles).not.toHaveBeenCalled();
    vi.setSystemTime(NOW - 5 * 3600_000);
    expect(setup(TRANSIT_ITINERARY).api.vehicles).not.toHaveBeenCalled();
  });

  it('no pide nada con la pestaña oculta', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const { api } = setup(TRANSIT_ITINERARY);
    act(() => vi.advanceTimersByTime(60_000));
    expect(api.vehicles).not.toHaveBeenCalled();
  });

  it('vacía la lista al cambiar de itinerario y deja de pedir al desmontar', async () => {
    const { result, rerender, unmount, api } = setup(TRANSIT_ITINERARY);
    await flush();
    expect(result.current).toHaveLength(1);
    rerender({ it: WALK_ITINERARY, r: 15 });
    expect(result.current).toEqual([]);
    unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(api.vehicles).toHaveBeenCalledTimes(1);
  });

  it('ignora los errores', async () => {
    const { result, api } = setup(TRANSIT_ITINERARY, 15, fakeApi({ vehicles: async () => Promise.reject(new Error('caído')) }));
    await flush();
    expect(api.vehicles).toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });
});
