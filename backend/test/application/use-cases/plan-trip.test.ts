import { beforeAll, describe, expect, it } from 'vitest';
import { NetworkNotLoadedError } from '../../../src/application/errors.js';
import { PlanTripUseCase } from '../../../src/application/use-cases/plan-trip.js';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { buildTestNetwork, near, ROUTING_OPTIONS, STOPS } from '../../fixtures/network.js';
import { fakeLogger } from '../../fixtures/fakes.js';

let network: TransitNetwork;
beforeAll(async () => {
  network = await buildTestNetwork();
});

const from = near(STOPS.A);
const to = near(STOPS.E);

describe('PlanTripUseCase', () => {
  it('falla si la red no está cargada', () => {
    const uc = new PlanTripUseCase({ current: null }, ROUTING_OPTIONS);
    expect(() => uc.execute({ from, to })).toThrow(NetworkNotLoadedError);
  });

  it('calcula el plan a la hora indicada', () => {
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS);
    const { plan, computeMs } = uc.execute({ from, to, dateTime: '2026-03-02T07:55:00+01:00' });
    expect(plan.requestedAt).toBe(Date.parse('2026-03-02T07:55:00+01:00'));
    expect(plan.itineraries).toHaveLength(2);
    expect(computeMs).toBeGreaterThanOrEqual(0);
  });

  it('sin hora usa la hora actual', () => {
    const now = Date.parse('2026-03-02T07:55:00+01:00');
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, undefined, () => now);
    const { plan, computeMs } = uc.execute({ from, to, maxItineraries: 1 });
    expect(plan.requestedAt).toBe(now);
    expect(plan.itineraries).toHaveLength(1);
    expect(computeMs).toBe(0);
  });

  it('con una hora no válida usa la hora actual', () => {
    const now = Date.parse('2026-03-02T07:55:00+01:00');
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, undefined, () => now);
    expect(uc.execute({ from, to, dateTime: 'no es una fecha' }).plan.requestedAt).toBe(now);
  });

  it('reutiliza el planificador mientras no cambie la red y lo rehace al cambiar', async () => {
    const provider: { current: TransitNetwork | null } = { current: network };
    const uc = new PlanTripUseCase(provider, ROUTING_OPTIONS);
    const dateTime = '2026-03-02T07:55:00+01:00';
    expect(uc.execute({ from, to, dateTime }).plan.itineraries).toHaveLength(2);
    provider.current = await buildTestNetwork({}, { agency: [] });
    // La red nueva está vacía: no hay paradas.
    expect(uc.execute({ from, to, dateTime }).plan.noRouteReason).toBe('NO_STOPS_NEAR_ORIGIN');
  });

  it('no registra las coordenadas del usuario en nivel info', () => {
    const logger = fakeLogger();
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, logger);
    uc.execute({ from, to, dateTime: '2026-03-02T07:55:00+01:00' });
    const infoText = logger.info.mock.calls.map((c) => String(c[0])).join('\n');
    expect(infoText).toMatch(/2 itinerarios/);
    expect(infoText).not.toContain(from.lat.toFixed(5));
    const debugText = logger.debug.mock.calls.map((c) => String(c[0])).join('\n');
    expect(debugText).toContain(from.lat.toFixed(5));
    expect(debugText).toContain('1 Plaza Mayor>Estación Central');
    expect(debugText).toContain('pie ');
  });

  it('incluye el motivo cuando no hay ruta', () => {
    const logger = fakeLogger();
    const uc = new PlanTripUseCase({ current: network }, ROUTING_OPTIONS, logger);
    uc.execute({ from: { lat: 0, lon: 0 }, to, dateTime: '2026-03-02T07:55:00+01:00' });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('NO_STOPS_NEAR_ORIGIN'));
  });
});
