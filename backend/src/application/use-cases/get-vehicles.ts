import type { VehicleStopStatus } from '../../domain/realtime/model.js';
import type { NetworkProvider } from '../ports/network-provider.js';
import type { RealtimeProvider } from '../ports/realtime-provider.js';

export interface VehicleInfo {
  /** Id del viaje tal y como aparece en los itinerarios. */
  tripId: string;
  vehicleId?: string;
  label?: string;
  lat: number;
  lon: number;
  bearing?: number;
  /** m/s */
  speed?: number;
  /** epoch ms de la posición. */
  timestamp?: number;
  status?: VehicleStopStatus;
  stopName?: string;
}

export const MAX_VEHICLE_TRIPS = 20;

/** Caso de uso: posición actual de los vehículos que hacen los viajes indicados. */
export class GetVehiclesUseCase {
  constructor(
    private readonly networks: NetworkProvider,
    private readonly realtime: RealtimeProvider,
  ) {}

  execute(tripIds: string[]): VehicleInfo[] {
    if (!this.realtime.enabled) return [];
    this.realtime.touch();
    const network = this.networks.current;
    const index = network ? this.realtime.indexFor(network) : null;
    if (!network || !index) return [];

    const result: VehicleInfo[] = [];
    for (const tripId of new Set(tripIds.slice(0, MAX_VEHICLE_TRIPS))) {
      const v = index.vehicles.get(tripId);
      if (!v) continue;
      const stopIdx = v.stopId !== undefined ? network.stopIndex.get(v.stopId) : undefined;
      result.push({
        tripId,
        vehicleId: v.vehicleId,
        label: v.label,
        lat: v.lat,
        lon: v.lon,
        bearing: v.bearing,
        speed: v.speed,
        timestamp: v.timestamp !== undefined ? v.timestamp * 1000 : undefined,
        status: v.currentStatus,
        stopName: stopIdx !== undefined ? network.stops[stopIdx].name : undefined,
      });
    }
    return result;
  }
}
