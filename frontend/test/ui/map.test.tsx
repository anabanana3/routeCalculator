import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { busLeg, itinerary, TRANSIT_ITINERARY, TZ } from '../fixtures';
import { TimeZoneContext } from '../../src/ui/time-zone';

const leaflet = vi.hoisted(() => ({
  map: { fitBounds: vi.fn() },
  events: {} as Record<string, (e: unknown) => void>,
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center, zoom }: { children: ReactNode; center: unknown; zoom: number }) => (
    <div data-testid="map" data-center={JSON.stringify(center)} data-zoom={zoom}>
      {children}
    </div>
  ),
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => (
    <div data-testid="tiles" data-url={url} data-attribution={attribution} />
  ),
  Marker: ({ position, eventHandlers }: { position: unknown; eventHandlers: { dragend: (e: unknown) => void } }) => (
    <button
      data-testid="marker"
      data-position={JSON.stringify(position)}
      onClick={() => eventHandlers.dragend({ target: { getLatLng: () => ({ lat: 1.5, lng: 2.5 }) } })}
    />
  ),
  Polyline: ({ positions, pathOptions }: { positions: unknown; pathOptions: { color: string; dashArray?: string } }) => (
    <div data-testid="polyline" data-color={pathOptions.color} data-dash={pathOptions.dashArray ?? ''} data-points={JSON.stringify(positions)} />
  ),
  CircleMarker: ({ children, center }: { children: ReactNode; center: unknown }) => (
    <div data-testid="circle" data-center={JSON.stringify(center)}>
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useMap: () => leaflet.map,
  useMapEvents: (handlers: Record<string, (e: unknown) => void>) => {
    leaflet.events = handlers;
    return leaflet.map;
  },
}));

const { ItineraryLayer } = await import('../../src/ui/components/map/ItineraryLayer');
const { MapView } = await import('../../src/ui/components/map/MapView');
const { destinationIcon, originIcon, pinHtml } = await import('../../src/ui/components/map/markers');

const CONFIG = { tileUrl: 'https://t/{z}/{x}/{y}.png', attribution: '© test', defaultCenter: [1, 2] as [number, number], defaultZoom: 14 };

beforeEach(() => {
  leaflet.map.fitBounds.mockClear();
});

describe('ItineraryLayer', () => {
  it('dibuja tramos a pie discontinuos y tramos en vehículo con su color', () => {
    render(
      <TimeZoneContext.Provider value={TZ}>
        <ItineraryLayer itinerary={TRANSIT_ITINERARY} />
      </TimeZoneContext.Provider>,
    );
    const lines = screen.getAllByTestId('polyline');
    expect(lines.map((l) => l.dataset.color)).toEqual(['#5f6368', '#ffffff', '#D32F2F', '#5f6368']);
    expect(lines[0].dataset.dash).toBe('1 10');
    expect(screen.getByText('Tirso · 08:10')).toBeInTheDocument();
    expect(screen.getByText('Sube en:')).toBeInTheDocument();
    expect(screen.getByText(/Sol · 08:05/)).toBeInTheDocument();
    expect(screen.getByText(/Atocha · 08:20/)).toBeInTheDocument();
    expect(screen.getAllByTestId('circle')).toHaveLength(3);
  });

  it('usa el color por defecto y tolera paradas sin hora ni id', () => {
    const it = itinerary([busLeg(0, 10, { route: undefined, intermediateStops: [{ name: 'X', lat: 1, lon: 1 }] })]);
    render(<ItineraryLayer itinerary={it} />);
    expect(screen.getAllByTestId('polyline')[1].dataset.color).toBe('#1a73e8');
    expect(screen.getByText('X')).toBeInTheDocument();
  });
});

describe('MapView', () => {
  function setup(extra: Record<string, unknown> = {}) {
    const props = {
      config: CONFIG,
      origin: null,
      destination: null,
      itinerary: null,
      focus: null,
      paddingTopLeft: [1, 1] as [number, number],
      paddingBottomRight: [2, 2] as [number, number],
      onMapClick: vi.fn(),
      onOriginChange: vi.fn(),
      onDestinationChange: vi.fn(),
      ...extra,
    };
    const view = render(<MapView {...props} />);
    return { props, view };
  }

  it('usa la configuración de teselas y centro', () => {
    setup();
    expect(screen.getByTestId('map').dataset.center).toBe('[1,2]');
    expect(screen.getByTestId('tiles').dataset.url).toBe(CONFIG.tileUrl);
    expect(screen.getByTestId('tiles').dataset.attribution).toBe('© test');
    expect(screen.queryByTestId('marker')).not.toBeInTheDocument();
  });

  it('convierte los clics del mapa a {lat, lon}', () => {
    const { props } = setup();
    leaflet.events.click({ latlng: { lat: 40.4, lng: -3.7 } });
    expect(props.onMapClick).toHaveBeenCalledWith({ lat: 40.4, lon: -3.7 });
  });

  it('encuadra solo cuando cambia la clave del foco', () => {
    const focus = { key: 'a', bounds: [[1, 2], [3, 4]] };
    const { props, view } = setup({ focus });
    expect(leaflet.map.fitBounds).toHaveBeenCalledWith(focus.bounds, { paddingTopLeft: [1, 1], paddingBottomRight: [2, 2], maxZoom: 17 });
    view.rerender(<MapView {...props} focus={{ ...focus, bounds: [[0, 0], [1, 1]] }} />);
    expect(leaflet.map.fitBounds).toHaveBeenCalledTimes(1);
    view.rerender(<MapView {...props} focus={{ key: 'b', bounds: [[0, 0], [1, 1]] }} />);
    expect(leaflet.map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it('marcadores arrastrables de origen y destino', () => {
    const { props } = setup({ origin: { lat: 1, lon: 2 }, destination: { lat: 3, lon: 4 } });
    const [o, d] = screen.getAllByTestId('marker');
    expect(o.dataset.position).toBe('[1,2]');
    o.click();
    expect(props.onOriginChange).toHaveBeenCalledWith({ lat: 1.5, lon: 2.5 });
    d.click();
    expect(props.onDestinationChange).toHaveBeenCalledWith({ lat: 1.5, lon: 2.5 });
  });

  it('dibuja el itinerario', () => {
    setup({ itinerary: TRANSIT_ITINERARY });
    expect(screen.getAllByTestId('polyline').length).toBeGreaterThan(0);
  });
});

describe('markers', () => {
  it('iconos de origen y destino', () => {
    expect(originIcon.options.html).toContain('#1a73e8');
    expect(destinationIcon.options.html).toContain('fill="#ea4335"');
    expect(destinationIcon.options.iconAnchor).toEqual([16, 42]);
  });

  it('pinHtml solo admite colores hexadecimales (evita inyectar HTML)', () => {
    expect(pinHtml('#123456')).toContain('fill="#123456"');
    expect(() => pinHtml('red" onload="alert(1)')).toThrow(/Color no válido/);
  });
});
