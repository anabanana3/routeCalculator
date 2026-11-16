import L, { type LatLngBoundsExpression, type PointExpression } from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { appConfig } from '../../config';
import type { ItineraryDto, LatLon } from '../../types/api';
import { ItineraryLayer } from './ItineraryLayer';
import { destinationIcon, originIcon } from './markers';

export interface MapFocus {
  bounds: LatLngBoundsExpression;
  /** Cambia para forzar un nuevo encuadre aunque los límites sean iguales. */
  key: string;
}

interface Props {
  origin: LatLon | null;
  destination: LatLon | null;
  itinerary: ItineraryDto | null;
  focus: MapFocus | null;
  /** Margen para que el panel lateral/inferior no tape la ruta al encuadrar. */
  paddingTopLeft: PointExpression;
  paddingBottomRight: PointExpression;
  onMapClick: (p: LatLon) => void;
  onOriginChange: (p: LatLon) => void;
  onDestinationChange: (p: LatLon) => void;
}

function ClickHandler({ onClick }: { onClick: (p: LatLon) => void }) {
  useMapEvents({
    click: (e) => onClick({ lat: e.latlng.lat, lon: e.latlng.lng }),
  });
  return null;
}

function FitBounds({ focus, paddingTopLeft, paddingBottomRight }: Pick<Props, 'focus' | 'paddingTopLeft' | 'paddingBottomRight'>) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.fitBounds(focus.bounds, { paddingTopLeft, paddingBottomRight, maxZoom: 17 });
    // Solo se reencuadra cuando cambia la clave del foco.
  }, [focus?.key, map]);
  return null;
}

function DraggableMarker({ position, icon, onChange }: { position: LatLon; icon: L.DivIcon; onChange: (p: LatLon) => void }) {
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
  const { origin, destination, itinerary } = props;
  return (
    <MapContainer
      center={appConfig.map.defaultCenter}
      zoom={appConfig.map.defaultZoom}
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url={appConfig.map.tileUrl} attribution={appConfig.map.attribution} maxZoom={19} />
      <ClickHandler onClick={props.onMapClick} />
      <FitBounds focus={props.focus} paddingTopLeft={props.paddingTopLeft} paddingBottomRight={props.paddingBottomRight} />
      {itinerary && <ItineraryLayer itinerary={itinerary} />}
      {origin && <DraggableMarker position={origin} icon={originIcon} onChange={props.onOriginChange} />}
      {destination && <DraggableMarker position={destination} icon={destinationIcon} onChange={props.onDestinationChange} />}
    </MapContainer>
  );
}
