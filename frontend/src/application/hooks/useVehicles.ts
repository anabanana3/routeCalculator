import { useEffect, useState } from 'react';
import { isTrackable, transitTripIds } from '../../domain/realtime';
import type { ItineraryDto, VehicleDto } from '../../domain/types/api';
import { useServices } from '../services';

/** No se piden posiciones más a menudo que esto aunque el backend refresque antes. */
export const MIN_VEHICLE_REFRESH_SECONDS = 10;

/**
 * Posición de los vehículos del itinerario mostrado, refrescada cada `refreshSeconds`
 * (null = sin tiempo real). No pide nada con la pestaña oculta ni para itinerarios lejanos.
 */
export function useVehicles(itinerary: ItineraryDto | null, refreshSeconds: number | null): VehicleDto[] {
  const { api } = useServices();
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const key = transitTripIds(itinerary).join(',');
  const trackable = isTrackable(itinerary, Date.now());

  useEffect(() => {
    setVehicles([]);
    if (!refreshSeconds || !key || !trackable) return;
    const tripIds = key.split(',');
    let controller: AbortController | undefined;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      controller?.abort();
      controller = new AbortController();
      api
        .vehicles(tripIds, controller.signal)
        .then((res) => setVehicles(res.vehicles))
        .catch(() => undefined);
    };
    load();
    const id = setInterval(load, Math.max(refreshSeconds, MIN_VEHICLE_REFRESH_SECONDS) * 1000);
    return () => {
      clearInterval(id);
      controller?.abort();
    };
  }, [api, key, refreshSeconds, trackable]);

  return vehicles;
}
