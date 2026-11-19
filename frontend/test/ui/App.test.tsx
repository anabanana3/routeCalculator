import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, geoResult as place, GTFS_INFO, NOW, PLAN, renderWithProviders } from '../fixtures';

const mapProps = vi.hoisted(() => ({ current: null as null | Record<string, (...args: never[]) => void> }));

// El mapa real (Leaflet) no funciona en jsdom: se sustituye por un doble que expone sus callbacks.
vi.mock('../../src/ui/components/map/MapView', () => ({
  MapView: (props: Record<string, (...args: never[]) => void>) => {
    mapProps.current = props;
    return <div data-testid="map" />;
  },
}));

const { default: App } = await import('../../src/ui/App');

const CONFIG = { tileUrl: 'https://t', attribution: '', defaultCenter: [0, 0] as [number, number], defaultZoom: 3 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function renderApp(api = fakeApi()) {
  renderWithProviders(<App mapConfig={CONFIG} />, { api });
  return api;
}

type PointCb = (p: { lat: number; lon: number }) => void;
const callMap = (name: string, p: { lat: number; lon: number }) =>
  act(() => (mapProps.current![name] as unknown as PointCb)(p));
const clickMap = (lat: number, lon: number) => callMap('onMapClick', { lat, lon });

describe('App', () => {
  it('muestra el buscador y el aviso de modo depuración', async () => {
    renderApp(fakeApi({ gtfsInfo: async () => ({ ...GTFS_INFO, ignoreServiceCalendar: true }) }));
    expect(screen.getByText('Transporte público')).toBeInTheDocument();
    expect(await screen.findByText(/Modo depuración/)).toBeInTheDocument();
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('calcula la ruta tras elegir origen y destino en el mapa y permite ver el detalle', async () => {
    const api = renderApp();
    await clickMap(40.4, -3.7);
    await clickMap(40.43, -3.69);
    expect(await screen.findByText('08:00 – 08:23')).toBeInTheDocument();
    expect(api.plan).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText('08:00 – 08:23'));
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
    expect(screen.queryByText('Transporte público')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByText('Transporte público')).toBeInTheDocument();
  });

  it('muestra el mensaje cuando no hay rutas', async () => {
    renderApp(fakeApi({ plan: async () => ({ ...PLAN, itineraries: [], message: 'No hay paradas cerca del origen' }) }));
    await clickMap(1, 1);
    await clickMap(2, 2);
    expect(await screen.findByText('No hay paradas cerca del origen')).toBeInTheDocument();
  });

  it('mensaje genérico si el servidor no explica por qué', async () => {
    renderApp(fakeApi({ plan: async () => ({ ...PLAN, itineraries: [] }) }));
    await clickMap(1, 1);
    await clickMap(2, 2);
    expect(await screen.findByText('No se han encontrado rutas')).toBeInTheDocument();
  });

  it('muestra los errores', async () => {
    renderApp(fakeApi({ gtfsInfo: async () => Promise.reject(new Error('x')) }));
    expect(await screen.findByText('No se puede conectar con el servidor')).toBeInTheDocument();
  });

  it('arrastrar los marcadores actualiza los puntos', async () => {
    const api = fakeApi({ geocodeReverse: vi.fn(async () => ({ result: { label: 'Calle', lat: 0, lon: 0, kind: 'street' as const } })) });
    renderApp(api);
    await callMap('onOriginChange', { lat: 1, lon: 2 });
    await callMap('onDestinationChange', { lat: 3, lon: 4 });
    await waitFor(() => expect(api.geocodeReverse).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByDisplayValue('Calle')).toHaveLength(2));
  });

  it('usa el diseño móvil en pantallas pequeñas', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      renderApp();
      expect(await screen.findByText('Transporte público')).toBeInTheDocument();
      expect((mapProps.current as unknown as { paddingBottomRight: [number, number] }).paddingBottomRight[1]).toBe(window.innerHeight * 0.5);
    } finally {
      window.matchMedia = original;
    }
  });

  it('el intercambio no falla sin puntos', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Intercambiar' }));
    expect(screen.getByPlaceholderText(/Origen/)).toHaveValue('');
  });

  it('elige un lugar del buscador', async () => {
    vi.useRealTimers();
    const api = fakeApi({ geocodeSearch: vi.fn(async () => ({ results: [place('Museo', 40.41, -3.69)] })) });
    renderApp(api);
    await userEvent.type(screen.getByPlaceholderText(/Origen/), 'museo');
    await userEvent.click(await screen.findByText('Museo', {}, { timeout: 2000 }));
    expect(screen.getByPlaceholderText(/Origen/)).toHaveValue('Museo');
  });
});

describe('main.tsx', () => {
  it('monta la aplicación con los servicios reales', async () => {
    const render = vi.fn();
    vi.doMock('react-dom/client', () => ({ createRoot: vi.fn(() => ({ render })) }));
    document.body.innerHTML = '<div id="root"></div>';
    await import('../../src/main');
    expect(render).toHaveBeenCalledTimes(1);
    const tree = render.mock.calls[0][0] as { props: { children: ReactNode } };
    expect(tree).toBeTruthy();
    vi.doUnmock('react-dom/client');
  });
});
