import { Fragment } from 'react';
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import { formatTime } from '../../../domain/format';
import { isWalk, MAP_WALK_COLOR, routeColor } from '../../../domain/itinerary';
import type { ItineraryDto } from '../../../domain/types/api';
import { useTimeZone } from '../../time-zone';

/** Dibuja un itinerario: tramos a pie discontinuos y tramos en vehículo con el color de la línea. */
export function ItineraryLayer({ itinerary }: { itinerary: ItineraryDto }) {
  const tz = useTimeZone();
  return (
    <>
      {itinerary.legs.map((leg, i) => {
        if (isWalk(leg)) {
          return (
            <Polyline
              key={`walk-${i}`}
              positions={leg.geometry}
              pathOptions={{ color: MAP_WALK_COLOR, weight: 5, dashArray: '1 10', lineCap: 'round' }}
            />
          );
        }
        const color = routeColor(leg);
        return (
          <Fragment key={`transit-${i}`}>
            <Polyline positions={leg.geometry} pathOptions={{ color: '#ffffff', weight: 10, opacity: 0.9 }} />
            <Polyline positions={leg.geometry} pathOptions={{ color, weight: 6 }} />
            {leg.intermediateStops?.map((s, k) => (
              <CircleMarker
                key={`${i}-${s.stopId ?? k}`}
                center={[s.lat, s.lon]}
                radius={3}
                pathOptions={{ color, fillColor: '#ffffff', fillOpacity: 1, weight: 2 }}
              >
                <Tooltip>
                  {s.name}
                  {s.time && ` · ${formatTime(s.time, tz)}`}
                </Tooltip>
              </CircleMarker>
            ))}
            {[
              { place: leg.from, time: leg.startTime, label: 'Sube en' },
              { place: leg.to, time: leg.endTime, label: 'Baja en' },
            ].map(({ place, time, label }) => (
              <CircleMarker
                key={`${i}-${label}`}
                center={[place.lat, place.lon]}
                radius={7}
                pathOptions={{ color, fillColor: '#ffffff', fillOpacity: 1, weight: 3 }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <strong>{label}:</strong> {place.name} · {formatTime(time, tz)}
                </Tooltip>
              </CircleMarker>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
