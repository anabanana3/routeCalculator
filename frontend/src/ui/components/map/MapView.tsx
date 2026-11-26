import L, { type PointExpression } from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { MapFocus } from '../../../domain/geo';
import type { ItineraryDto, LatLon, VehicleDto } from '../../../domain/types/api';
import type { AppConfig } from '../../../infrastructure/config';
import { ItineraryLayer } from './ItineraryLayer';
import { destinationIcon, originIcon } from './markers';
import { VehicleLayer } from './VehicleLayer';

export type { MapFocus } from '../../../domain/geo';

interface Props {
  config: AppConfig['map'];
  origin: LatLon | null;
  destination: LatLon | null;
  itinerary: ItineraryDto | null;
  /** Vehículos en tiempo real del itinerario. */
  vehicles?: VehicleDto[];
  focus: MapFocus | null;
  /** Margen para que el panel lateral/inferior no tape la ruta al encuadrar. */
  paddingTopLeft: PointExpression;
  paddingBottomRight: PointExpression;
  onMapClick: (p: LatLon) => void;
  onOriginChange: (p: LatLon) => void;
  onDestinationChange: (p: LatLon) => void;
}

export function ClickHandler({ onClick }: { onClick: (p: LatLon) => void }) {
  useMapEvents({
    click: (e) => onClick({ lat: e.latlng.lat, lon: e.latlng.lng }),
  });
  return null;
}

export function FitBounds({
  focus,
  paddingTopLeft,
  paddingBottomRight,
}: Pick<Props, 'focus' | 'paddingTopLeft' | 'paddingBottomRight'>) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.fitBounds(focus.bounds, { paddingTopLeft, paddingBottomRight, maxZoom: 17 });
    // Solo se reencuadra cuando cambia la clave del foco.
  }, [focus?.key, map]);
  return null;
}

export function DraggableMarker({
  position,
  icon,
  onChange,
}: {
  position: LatLon;
  icon: L.DivIcon;
  onChange: (p: LatLon) => void;
}) {
  return (
    <Marker
      position={[position.lat, position.lon]}
      icon={icon}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const ll = (e.target as L.Marker).getLatLng();
          onChange({ lat: ll.lat, lon: ll.lng });
        },
      }}
    />
  );
}

export function MapView(props: Props) {
  const { origin, destination, itinerary, vehicles, config } = props;
  return (
    <MapContainer center={config.defaultCenter} zoom={config.defaultZoom} zoomControl={false} style={{ height: '100%', width: '100%' }}>
      <TileLayer url={config.tileUrl} attribution={config.attribution} maxZoom={19} />
      <ClickHandler onClick={props.onMapClick} />
      <FitBounds focus={props.focus} paddingTopLeft={props.paddingTopLeft} paddingBottomRight={props.paddingBottomRight} />
      {itinerary && <ItineraryLayer itinerary={itinerary} />}
      {itinerary && vehicles && vehicles.length > 0 && <VehicleLayer itinerary={itinerary} vehicles={vehicles} />}
      {origin && <DraggableMarker position={origin} icon={originIcon} onChange={props.onOriginChange} />}
      {destination && <DraggableMarker position={destination} icon={destinationIcon} onChange={props.onDestinationChange} />}
    </MapContainer>
  );
}
