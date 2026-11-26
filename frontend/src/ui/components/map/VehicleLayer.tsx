import { Marker, Tooltip } from 'react-leaflet';
import { useNow } from '../../../application/hooks/useNow';
import { routeColor } from '../../../domain/itinerary';
import { formatAge, vehicleWhere } from '../../../domain/realtime';
import type { ItineraryDto, VehicleDto } from '../../../domain/types/api';
import { vehicleIcon } from './markers';

/** Vehículos en tiempo real de los tramos del itinerario, con el color de su línea. */
export function VehicleLayer({ itinerary, vehicles }: { itinerary: ItineraryDto; vehicles: VehicleDto[] }) {
  const now = useNow(10_000);
  return (
    <>
      {vehicles.map((v) => {
        const leg = itinerary.legs.find((l) => l.tripId === v.tripId);
        if (!leg) return null;
        const where = vehicleWhere(v);
        const age = formatAge(v.timestamp, now);
        return (
          <Marker key={v.tripId} position={[v.lat, v.lon]} icon={vehicleIcon(routeColor(leg), v.bearing)} zIndexOffset={1000}>
            <Tooltip direction="top" offset={[0, -10]}>
              <strong>{leg.route?.shortName ?? 'Vehículo'}</strong>
              {v.label && ` · ${v.label}`}
              {where && ` · ${where}`}
              {age && ` · ${age}`}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
