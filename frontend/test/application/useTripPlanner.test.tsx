import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GeolocationError } from '../../src/application/ports/geolocation';
import { SERVER_UNREACHABLE, useTripPlanner } from '../../src/application/hooks/useTripPlanner';
import { GEOLOCATION_MESSAGES } from '../../src/domain/trip-search';
import { deferred, fakeApi, fakeGeolocation, GTFS_INFO, PLAN, place, servicesWrapper, TRANSIT_ITINERARY, TZ } from '../fixtures';

const FIXED_NOW = () => new Date(2026, 2, 2, 8, 0);

function setup(api = fakeApi(), geolocation = fakeGeolocation()) {
  const hook = renderHook(() => useTripPlanner(FIXED_NOW), { wrapper: servicesWrapper({ api, geolocation }) });
  return { ...hook, api, geolocation };
}

const A = place('Plaza', 40.4, -3.7);
const B = place('Museo', 40.42, -3.69);

describe('useTripPlanner: carga inicial', () => {
  it('lee la información del GTFS y encuadra su zona', async () => {
    const { result } = setup(fakeApi({ gtfsInfo: async () => ({ ...GTFS_INFO, ignoreServiceCalendar: true }) }));
    await waitFor(() => expect(result.current.focus?.key).toBe('gtfs'));
    expect(result.current.focus!.bounds).toEqual([
      [40.4, -3.72],
      [40.43, -3.68],
    ]);
    expect(result.current.timeZone).toBe(TZ);
    expect(result.current.ignoreCalendar).toBe(true);
    expect(result.current.departAt).toBe('2026-03-02T08:00');
    expect(result.current.departMode).toBe('now');
  });

  it('sin límites no encuadra', async () => {
    const { result } = setup(fakeApi({ gtfsInfo: async () => ({ ...GTFS_INFO, bounds: undefined }) }));
    await waitFor(() => expect(result.current.timeZone).toBe(TZ));
    expect(result.current.focus).toBeNull();
  });

  it('muestra un error si no hay servidor', async () => {
    const { result } = setup(fakeApi({ gtfsInfo: async () => Promise.reject(new Error('fetch failed')) }));
    await waitFor(() => expect(result.current.error).toBe(SERVER_UNREACHABLE));
  });

  it('ignora la cancelación al desmontar', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { result, unmount } = setup(fakeApi({ gtfsInfo: async () => Promise.reject(abort) }));
    await act(async () => {});
    expect(result.current.error).toBeNull();
    unmount();
  });
});

describe('useTripPlanner: cálculo de rutas', () => {
  it('con solo el origen no calcula y pasa al destino', async () => {
    const { result, api } = setup();
    act(() => result.current.choosePlace('origin', A));
    expect(result.current.origin).toEqual(A);
    expect(result.current.activeField).toBe('destination');
    expect(result.current.focus?.key).toMatch(/^place-/);
    expect(api.plan).not.toHaveBeenCalled();
  });

  it('con origen y destino calcula y muestra el plan', async () => {
    const { result, api } = setup();
    act(() => result.current.choosePlace('origin', A));
    act(() => result.current.choosePlace('destination', B));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.plan).toEqual(PLAN));
    expect(result.current.loading).toBe(false);
    expect(api.plan).toHaveBeenCalledWith({ from: { lat: 40.4, lon: -3.7 }, to: { lat: 40.42, lon: -3.69 } }, expect.any(AbortSignal));
    expect(result.current.itineraries).toHaveLength(2);
    expect(result.current.shown).toBe(PLAN.itineraries[0]);
    expect(result.current.focus?.key).toMatch(/^plan-/);
    // Con los dos puntos elegidos el campo activo no cambia.
    expect(result.current.activeField).toBe('destination');
  });

  it('cambiar solo el nombre no recalcula', async () => {
    const { result, api } = setup();
    act(() => result.current.choosePlace('origin', A));
    act(() => result.current.choosePlace('destination', B));
    await waitFor(() => expect(result.current.plan).not.toBeNull());
    act(() => result.current.choosePlace('origin', { ...A, label: 'Otro nombre' }));
    await act(async () => {});
    expect(api.plan).toHaveBeenCalledTimes(1);
  });

  it('cancela la petición anterior si cambian los puntos', async () => {
    const first = deferred<typeof PLAN>();
    const api = fakeApi();
    api.plan.mockImplementationOnce(() => first.promise);
    const { result } = setup(api);
    act(() => result.current.choosePlace('origin', A));
    act(() => result.current.choosePlace('destination', B));
    act(() => result.current.choosePlace('destination', place('Otro', 40.43, -3.68)));
    expect(api.plan.mock.calls[0][1]!.aborted).toBe(true);
    await waitFor(() => expect(result.current.plan).toEqual(PLAN));
  });

  it('con hora de salida la envía', async () => {
    const { result, api } = setup();
    act(() => {
      result.current.choosePlace('origin', A);
      result.current.choosePlace('destination', B);
      result.current.setDepartMode('at');
      result.current.setDepartAt('2026-03-02T09:30');
    });
    await waitFor(() =>
      expect(api.plan).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateTime: new Date('2026-03-02T09:30').toISOString() }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('muestra el error del servidor', async () => {
    const { result } = setup(fakeApi({ plan: async () => Promise.reject(new Error('Petición no válida')) }));
    act(() => result.current.choosePlace('origin', A));
    act(() => result.current.choosePlace('destination', B));
    await waitFor(() => expect(result.current.error).toBe('Petición no válida'));
    expect(result.current.loading).toBe(false);
  });

  it('un plan sin itinerarios no cambia el encuadre', async () => {
    const { result } = setup(fakeApi({ plan: async () => ({ ...PLAN, itineraries: [] }) }));
    act(() => result.current.choosePlace('origin', A));
    act(() => result.current.choosePlace('destination', B));
    await waitFor(() => expect(result.current.plan?.itineraries).toEqual([]));
    expect(result.current.focus?.key).not.toMatch(/^plan-/);
    expect(result.current.shown).toBeNull();
  });

  it('al borrar un punto se limpia el plan', async () => {
    const { result } = setup();
    act(() => result.current.choosePlace('origin', A));
    act(() => result.current.choosePlace('destination', B));
    await waitFor(() => expect(result.current.plan).not.toBeNull());
    act(() => result.current.choosePlace('destination', null));
    expect(result.current.plan).toBeNull();
  });
});

describe('useTripPlanner: mapa', () => {
  it('pone el punto con coordenadas y después su nombre', async () => {
    const api = fakeApi({ geocodeReverse: async () => ({ result: { label: 'Gran Vía', secondary: 'Madrid', lat: 0, lon: 0, kind: 'street' } }) });
    const { result } = setup(api);
    act(() => result.current.setPointFromMap('origin', { lat: 40.41, lon: -3.7 }));
    expect(result.current.origin).toEqual({ lat: 40.41, lon: -3.7, kind: 'map', label: '40.41000, -3.70000' });
    await waitFor(() => expect(result.current.origin?.label).toBe('Gran Vía'));
    expect(result.current.origin).toEqual({ lat: 40.41, lon: -3.7, kind: 'map', label: 'Gran Vía', secondary: 'Madrid' });
  });

  it('descarta nombres que llegan tarde si el punto ya cambió', async () => {
    const slow = deferred<{ result: { label: string; lat: number; lon: number; kind: 'street' } }>();
    const api = fakeApi();
    api.geocodeReverse.mockImplementationOnce(() => slow.promise);
    const { result } = setup(api);
    act(() => result.current.setPointFromMap('origin', { lat: 1, lon: 1 }));
    act(() => result.current.choosePlace('origin', A));
    await act(async () => slow.resolve({ result: { label: 'Tarde', lat: 1, lon: 1, kind: 'street' } }));
    expect(result.current.origin).toEqual(A);
  });

  it('si la geocodificación inversa falla se quedan las coordenadas', async () => {
    const { result } = setup(fakeApi({ geocodeReverse: async () => Promise.reject(new Error('x')) }));
    act(() => result.current.setPointFromMap('destination', { lat: 1, lon: 2 }));
    await act(async () => {});
    expect(result.current.destination?.label).toBe('1.00000, 2.00000');
  });

  it('pulsar en el mapa coloca el campo activo y pasa al siguiente', () => {
    const { result } = setup();
    act(() => result.current.clickMap({ lat: 1, lon: 2 }));
    expect(result.current.origin).toMatchObject({ lat: 1, lon: 2, kind: 'map' });
    expect(result.current.activeField).toBe('destination');
    act(() => result.current.clickMap({ lat: 3, lon: 4 }));
    expect(result.current.destination).toMatchObject({ lat: 3, lon: 4 });
    expect(result.current.activeField).toBe('destination');
  });
});

describe('useTripPlanner: ubicación, intercambio y selección', () => {
  it('"Tu ubicación" rellena el campo', async () => {
    const pos = deferred<{ lat: number; lon: number }>();
    const { result } = setup(undefined, fakeGeolocation(() => pos.promise));
    act(() => result.current.locate('origin'));
    expect(result.current.locating).toBe('origin');
    await act(async () => pos.resolve({ lat: 40.41, lon: -3.71 }));
    expect(result.current.locating).toBeNull();
    expect(result.current.origin).toEqual({ lat: 40.41, lon: -3.71, kind: 'current', label: 'Tu ubicación' });
    expect(result.current.activeField).toBe('destination');
  });

  it.each([
    [new GeolocationError('denied'), GEOLOCATION_MESSAGES.denied],
    [new GeolocationError('unsupported'), GEOLOCATION_MESSAGES.unsupported],
    [new Error('otro'), GEOLOCATION_MESSAGES.unavailable],
  ])('muestra el error de geolocalización %s', async (err, message) => {
    const { result } = setup(undefined, fakeGeolocation(async () => Promise.reject(err)));
    act(() => result.current.locate('destination'));
    await waitFor(() => expect(result.current.error).toBe(message));
    expect(result.current.locating).toBeNull();
  });

  it('intercambia origen y destino', () => {
    const { result } = setup();
    act(() => result.current.choosePlace('origin', A));
    act(() => result.current.choosePlace('destination', B));
    act(() => result.current.swap());
    expect(result.current.origin).toEqual(B);
    expect(result.current.destination).toEqual(A);
  });

  it('prioriza la búsqueda cerca del otro punto', () => {
    const { result } = setup();
    expect(result.current.searchFocus).toBeUndefined();
    act(() => result.current.choosePlace('origin', A));
    expect(result.current.activeField).toBe('destination');
    expect(result.current.searchFocus).toEqual({ lat: 40.4, lon: -3.7 });
    act(() => result.current.setActiveField('origin'));
    expect(result.current.searchFocus).toBeUndefined();
  });

  it('seleccionar, resaltar, enfocar tramos y volver', async () => {
    const { result } = setup();
    act(() => result.current.choosePlace('origin', A));
    act(() => result.current.choosePlace('destination', B));
    await waitFor(() => expect(result.current.plan).not.toBeNull());

    act(() => result.current.setHighlighted(1));
    expect(result.current.shown).toBe(PLAN.itineraries[1]);

    act(() => result.current.selectItinerary(0));
    expect(result.current.selected).toBe(0);
    expect(result.current.shown).toBe(TRANSIT_ITINERARY);
    expect(result.current.focus?.key).toMatch(/^sel-/);

    act(() => result.current.focusLeg(1));
    expect(result.current.focus?.key).toMatch(/^leg-/);
    expect(result.current.focus?.bounds).toEqual([
      [40.41, -3.7],
      [40.42, -3.69],
    ]);

    const before = result.current.focus;
    act(() => result.current.focusLeg(99));
    act(() => result.current.selectItinerary(99));
    expect(result.current.focus).toBe(before);

    act(() => result.current.back());
    expect(result.current.selected).toBeNull();
  });
});
