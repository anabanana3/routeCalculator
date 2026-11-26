import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RealtimeProvider } from '../../../src/application/ports/realtime-provider.js';
import { GetVehiclesUseCase, MAX_VEHICLE_TRIPS } from '../../../src/application/use-cases/get-vehicles.js';
import type { TransitNetwork } from '../../../src/domain/network/model.js';
import { buildRealtimeIndex } from '../../../src/domain/realtime/realtime-index.js';
import { buildTestNetwork } from '../../fixtures/network.js';
import { feed, vehicle } from '../../fixtures/realtime.js';

let network: TransitNetwork;
beforeAll(async () => {
  network = await buildTestNetwork();
});

function provider(enabled = true, withIndex = true) {
  return {
    enabled,
    touch: vi.fn(),
    awaitFresh: vi.fn(async () => {}),
    indexFor: vi.fn((n: TransitNetwork) =>
      withIndex
        ? buildRealtimeIndex(
            n,
            [
              feed([], {
                vehicles: [
                  vehicle('v1', {
                    trip: { tripId: 'T1', scheduleRelationship: 'SCHEDULED' },
                    vehicleId: 'BUS-1',
                    label: 'Bus 1',
                    bearing: 45,
                    speed: 7,
                    timestamp: 1772434795,
                    stopId: 'B',
                    currentStatus: 'IN_TRANSIT_TO',
                  }),
                  vehicle('v2', { trip: { tripId: 'T2', scheduleRelationship: 'SCHEDULED' }, stopId: 'NO_EXISTE' }),
                ],
              }),
            ],
            Date.parse('2026-03-02T08:00:00+01:00'),
          )
        : null,
    ),
  } satisfies RealtimeProvider;
}

describe('GetVehiclesUseCase', () => {
  it('devuelve la posición de los vehículos de los viajes pedidos', () => {
    const rt = provider();
    const uc = new GetVehiclesUseCase({ current: network }, rt);
    expect(uc.execute(['T1', 'T2', 'T1', 'T5'])).toEqual([
      {
        tripId: 'T1',
        vehicleId: 'BUS-1',
        label: 'Bus 1',
        lat: 40.4,
        lon: -3.697,
        bearing: 45,
        speed: 7,
        timestamp: 1772434795_000,
        status: 'IN_TRANSIT_TO',
        stopName: 'Calle Real',
      },
      { tripId: 'T2', lat: 40.4, lon: -3.697 },
    ]);
    expect(rt.touch).toHaveBeenCalledTimes(1);
  });

  it('limita el número de viajes consultados', () => {
    const uc = new GetVehiclesUseCase({ current: network }, provider());
    const ids = [...Array.from({ length: MAX_VEHICLE_TRIPS }, (_, i) => `X${i}`), 'T1'];
    expect(uc.execute(ids)).toEqual([]);
  });

  it('lista vacía sin tiempo real, sin red o sin datos', () => {
    const disabled = provider(false);
    expect(new GetVehiclesUseCase({ current: network }, disabled).execute(['T1'])).toEqual([]);
    expect(disabled.touch).not.toHaveBeenCalled();
    expect(new GetVehiclesUseCase({ current: null }, provider()).execute(['T1'])).toEqual([]);
    expect(new GetVehiclesUseCase({ current: network }, provider(true, false)).execute(['T1'])).toEqual([]);
  });
});
