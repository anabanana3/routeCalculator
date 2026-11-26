import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NetworkNotLoadedError } from '../../../src/application/errors.js';
import type { RealtimeProvider } from '../../../src/application/ports/realtime-provider.js';
import { PlanTripUseCase, REALTIME_WAIT_WINDOW_MS } from '../../../src/application/use-cases/plan-trip.js';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { buildRealtimeIndex } from '../../../src/domain/realtime/realtime-index.js';
import { buildTestNetwork, near, ROUTING_OPTIONS, STOPS } from '../../fixtures/network.js';
import { fakeLogger } from '../../fixtures/fakes.js';
import { feed, tripUpdate } from '../../fixtures/realtime.js';

let network: TransitNetwork;
beforeAll(async () => {
  network = await buildTestNetwork();
});

const from = near(STOPS.A);
const to = near(STOPS.E);

function fakeRealtime(overrides: Partial<RealtimeProvider> = {}) {
  return {
    enabled: true,
    touch: vi.fn(),
    awaitFresh: vi.fn(async () => {}),
    indexFor: vi.fn<RealtimeProvider['indexFor']>(() => null),
    ...overrides,
  } satisfies RealtimeProvider;
}

describe('PlanTripUseCase', () => {
  it('falla si la red no está cargada', async () => {
    const uc = new PlanTripUseCase({ current: null }, ROUTING_OPTIONS);
    await expect(uc.execute({ from, to })).rejects.toThrow(NetworkNotLoadedError);
  });

  it('calcula el plan a la hora indicada', async () => {
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS);
    const { plan, computeMs } = await uc.execute({ from, to, dateTime: '2026-03-02T07:55:00+01:00' });
    expect(plan.requestedAt).toBe(Date.parse('2026-03-02T07:55:00+01:00'));
    expect(plan.itineraries).toHaveLength(2);
    expect(plan.realtimeUpdatedAt).toBeUndefined();
    expect(computeMs).toBeGreaterThanOrEqual(0);
  });

  it('sin hora usa la hora actual', async () => {
    const now = Date.parse('2026-03-02T07:55:00+01:00');
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, undefined, () => now);
    const { plan, computeMs } = await uc.execute({ from, to, maxItineraries: 1 });
    expect(plan.requestedAt).toBe(now);
    expect(plan.itineraries).toHaveLength(1);
    expect(computeMs).toBe(0);
  });

  it('con una hora no válida usa la hora actual', async () => {
    const now = Date.parse('2026-03-02T07:55:00+01:00');
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, undefined, () => now);
    expect((await uc.execute({ from, to, dateTime: 'no es una fecha' })).plan.requestedAt).toBe(now);
  });

  it('reutiliza el planificador mientras no cambie la red y lo rehace al cambiar', async () => {
    const provider: { current: TransitNetwork | null } = { current: network };
    const uc = new PlanTripUseCase(provider, ROUTING_OPTIONS);
    const dateTime = '2026-03-02T07:55:00+01:00';
    expect((await uc.execute({ from, to, dateTime })).plan.itineraries).toHaveLength(2);
    provider.current = await buildTestNetwork({}, { agency: [] });
    // La red nueva está vacía: no hay paradas.
    expect((await uc.execute({ from, to, dateTime })).plan.noRouteReason).toBe('NO_STOPS_NEAR_ORIGIN');
  });

  it('no registra las coordenadas del usuario en nivel info', async () => {
    const logger = fakeLogger();
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, logger);
    await uc.execute({ from, to, dateTime: '2026-03-02T07:55:00+01:00' });
    const infoText = logger.info.mock.calls.map((c) => String(c[0])).join('\n');
    expect(infoText).toMatch(/2 itinerarios/);
    expect(infoText).not.toContain(from.lat.toFixed(5));
    const debugText = logger.debug.mock.calls.map((c) => String(c[0])).join('\n');
    expect(debugText).toContain(from.lat.toFixed(5));
    expect(debugText).toContain('1 Plaza Mayor>Estación Central');
    expect(debugText).toContain('pie ');
  });

  it('incluye el motivo cuando no hay ruta', async () => {
    const logger = fakeLogger();
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, logger);
    await uc.execute({ from: { lat: 0, lon: 0 }, to, dateTime: '2026-03-02T07:55:00+01:00' });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('NO_STOPS_NEAR_ORIGIN'));
  });
});

describe('PlanTripUseCase con tiempo real', () => {
  const now = Date.parse('2026-03-02T07:55:00+01:00');

  it('espera a los datos si la salida es cercana y los usa en el cálculo', async () => {
    const index = buildRealtimeIndex(network, [feed([tripUpdate('T1', { delay: 120 })])], now);
    const realtime = fakeRealtime({ indexFor: vi.fn(() => index) });
    const logger = fakeLogger();
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, logger, () => now, realtime);
    const { plan } = await uc.execute({ from, to });
    expect(realtime.awaitFresh).toHaveBeenCalledTimes(1);
    expect(realtime.indexFor).toHaveBeenCalledWith(network);
    expect(plan.realtimeUpdatedAt).toBe(index.updatedAt);
    expect(plan.itineraries[0].legs[1].realtime?.departureDelaySeconds).toBe(120);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('con tiempo real'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('(+120s)'));
  });

  it('para salidas lejanas solo registra la actividad', async () => {
    const realtime = fakeRealtime();
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, undefined, () => now, realtime);
    await uc.execute({ from, to, dateTime: new Date(now + REALTIME_WAIT_WINDOW_MS + 60_000).toISOString() });
    expect(realtime.awaitFresh).not.toHaveBeenCalled();
    expect(realtime.touch).toHaveBeenCalledTimes(1);
  });

  it('no consulta el tiempo real si no está configurado', async () => {
    const realtime = fakeRealtime({ enabled: false });
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, undefined, () => now, realtime);
    await uc.execute({ from, to });
    expect(realtime.awaitFresh).not.toHaveBeenCalled();
    expect(realtime.indexFor).not.toHaveBeenCalled();
  });

  it('falla si la red desaparece durante la espera', async () => {
    const provider: { current: TransitNetwork | null } = { current: network };
    const realtime = fakeRealtime({
      awaitFresh: vi.fn(async () => {
        provider.current = null;
      }),
    });
    const uc = new PlanTripUseCase(provider, ROUTING_OPTIONS, undefined, () => now, realtime);
    await expect(uc.execute({ from, to })).rejects.toThrow(NetworkNotLoadedError);
  });
});
