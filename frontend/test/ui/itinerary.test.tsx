import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LATE_COLOR, ON_TIME_COLOR } from '../../src/domain/realtime';
import type { AlertDto } from '../../src/domain/types/api';
import { AlertList } from '../../src/ui/components/AlertList';
import { ItineraryDetail } from '../../src/ui/components/ItineraryDetail';
import { ItineraryList } from '../../src/ui/components/ItineraryList';
import { busLeg, iso, itinerary, NOW, renderWithProviders, TRANSIT_ITINERARY, walkLeg, WALK_ITINERARY } from '../fixtures';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('ItineraryList', () => {
  it('resume cada itinerario', () => {
    renderWithProviders(
      <ItineraryList itineraries={[TRANSIT_ITINERARY, WALK_ITINERARY]} highlighted={0} onHighlight={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('08:00 – 08:23')).toBeInTheDocument();
    expect(screen.getByText('23 min')).toBeInTheDocument();
    expect(screen.getByText(/Sale en 5 min de Sol · 640 m a pie/)).toBeInTheDocument();
    expect(screen.getByText('L1')).toBeInTheDocument();
    expect(screen.getByText(/Solo a pie/)).toBeInTheDocument();
  });

  it('muestra los transbordos', () => {
    const it2 = itinerary([busLeg(0, 10), busLeg(12, 20)]);
    renderWithProviders(<ItineraryList itineraries={[it2]} highlighted={0} onHighlight={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText(/1 transbordo$/)).toBeInTheDocument();
  });

  it('resalta al pasar el ratón y selecciona al pulsar', async () => {
    const onHighlight = vi.fn();
    const onSelect = vi.fn();
    renderWithProviders(
      <ItineraryList itineraries={[TRANSIT_ITINERARY, WALK_ITINERARY]} highlighted={0} onHighlight={onHighlight} onSelect={onSelect} />,
    );
    const items = screen.getAllByRole('button');
    expect(items[0]).toHaveClass('Mui-selected');
    fireEvent.mouseEnter(items[1]);
    expect(onHighlight).toHaveBeenCalledWith(1);
    await userEvent.click(items[1]);
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

describe('ItineraryDetail', () => {
  function setup(extra: Partial<Parameters<typeof ItineraryDetail>[0]> = {}) {
    const props = { itinerary: TRANSIT_ITINERARY, onBack: vi.fn(), onFocusLeg: vi.fn(), ...extra };
    renderWithProviders(<ItineraryDetail {...props} />);
    return props;
  }

  it('muestra la cabecera y la línea de tiempo', () => {
    setup({ originLabel: 'Mi casa', destinationLabel: 'Museo' });
    expect(screen.getByText('23 min')).toBeInTheDocument();
    expect(screen.getByText(/08:00 – 08:23 · 640 m a pie/)).toBeInTheDocument();
    expect(screen.getByText('Mi casa')).toBeInTheDocument();
    expect(screen.getByText('Museo')).toBeInTheDocument();
    expect(screen.getByText('Camina 4 min (320 m)')).toBeInTheDocument();
    expect(screen.getByText('Atocha', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Sale en 5 min')).toBeInTheDocument();
    expect(screen.getByText('Siguientes: 08:15 · 08:25')).toBeInTheDocument();
    expect(screen.getByText('Parada 101')).toBeInTheDocument();
    expect(screen.getByText('Bájate aquí · Parada 102')).toBeInTheDocument();
  });

  it('etiquetas por defecto de origen y destino', () => {
    setup();
    expect(screen.getByText('Origen')).toBeInTheDocument();
    expect(screen.getByText('Destino', { selector: 'p' })).toBeInTheDocument();
  });

  it('despliega las paradas intermedias', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: /2 paradas · 15 min/ });
    expect(screen.getByText('08:10 · Tirso')).not.toBeVisible();
    await userEvent.click(toggle);
    expect(screen.getByText('08:10 · Tirso')).toBeVisible();
  });

  it('sin paradas intermedias el botón está deshabilitado', () => {
    setup({ itinerary: itinerary([busLeg(0, 10, { intermediateStops: [], nextDepartures: undefined, headsign: undefined, to: { name: 'Fin', lat: 0, lon: 0 } })]) });
    expect(screen.getByRole('button', { name: /1 parada/ })).toBeDisabled();
    expect(screen.queryByText(/Siguientes/)).not.toBeInTheDocument();
    expect(screen.getByText('Bájate aquí')).toBeInTheDocument();
  });

  it('volver y enfocar tramos', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(props.onBack).toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('leg-1'));
    expect(props.onFocusLeg).toHaveBeenCalledWith(1);
  });

  it('un tramo a pie tras un vehículo no repite la parada', () => {
    setup({ itinerary: itinerary([busLeg(0, 10), walkLeg(10, 12)]) });
    // "Atocha" aparece solo como llegada del autobús (y en la dirección), no como inicio del tramo a pie.
    expect(screen.getAllByText('Atocha', { selector: 'p' })).toHaveLength(1);
  });
});

const realtime = (depDelay: number, arrDelay = depDelay) => ({
  scheduledStartTime: iso(5 - depDelay / 60),
  scheduledEndTime: iso(20 - arrDelay / 60),
  departureDelaySeconds: depDelay,
  arrivalDelaySeconds: arrDelay,
});

const ALERTS: AlertDto[] = [
  { id: 'a1', header: 'Huelga parcial', description: 'Servicios mínimos del 30%', url: 'https://bus.test/avisos', cause: 'STRIKE', effect: 'REDUCED_SERVICE', severity: 'WARNING' },
  { id: 'a2', header: '', cause: 'UNKNOWN_CAUSE', effect: 'DETOUR', severity: 'UNKNOWN_SEVERITY' },
];

describe('tiempo real en los itinerarios', () => {
  it('la lista indica el retraso del primer vehículo y los avisos', () => {
    const it = itinerary([walkLeg(0, 4), busLeg(5, 20, { realtime: realtime(180), alerts: ALERTS })]);
    renderWithProviders(<ItineraryList itineraries={[it, TRANSIT_ITINERARY]} highlighted={0} onHighlight={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText('Tiempo real · 3 min de retraso')).toBeInTheDocument();
    expect(screen.getByText('2 avisos')).toBeInTheDocument();
    expect(screen.getAllByText(/Tiempo real/)).toHaveLength(1);
  });

  it('la lista muestra avisos aunque no haya horas en tiempo real', () => {
    const it = itinerary([busLeg(5, 20, { alerts: [ALERTS[0]] })]);
    renderWithProviders(<ItineraryList itineraries={[it]} highlighted={0} onHighlight={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText('1 aviso')).toBeInTheDocument();
    expect(screen.queryByText(/Tiempo real/)).not.toBeInTheDocument();
  });

  it('el detalle muestra la hora prevista y la programada tachada', () => {
    const it = itinerary([walkLeg(0, 4), busLeg(5, 20, { realtime: realtime(120, 0) })]);
    renderWithProviders(<ItineraryDetail itinerary={it} onBack={vi.fn()} onFocusLeg={vi.fn()} />);
    expect(screen.getByText('Tiempo real · 2 min de retraso')).toBeInTheDocument();
    // Salida: 08:05 prevista (programada 08:03, tachada). Llegada puntual: sin hora tachada.
    expect(screen.getByLabelText('Programada 08:03')).toHaveTextContent('08:03');
    expect(screen.getByText('08:05')).toHaveStyle({ color: LATE_COLOR });
    expect(screen.queryByLabelText(/Programada 08:20/)).not.toBeInTheDocument();
    expect(screen.getAllByText('08:20')[0]).toHaveStyle({ color: ON_TIME_COLOR });
  });

  it('el detalle muestra la posición del vehículo', () => {
    vi.setSystemTime(NOW + 30_000);
    const vehicles = [
      { tripId: 'T1', lat: 0, lon: 0, label: '1234', stopName: 'Sol', status: 'INCOMING_AT' as const, timestamp: iso(0) },
      { tripId: 'OTRO', lat: 0, lon: 0 },
    ];
    renderWithProviders(<ItineraryDetail itinerary={TRANSIT_ITINERARY} vehicles={vehicles} onBack={vi.fn()} onFocusLeg={vi.fn()} />);
    expect(screen.getByText('Vehículo 1234: llegando a Sol (hace 30 s)')).toBeInTheDocument();
  });

  it('vehículo sin parada ni hora', () => {
    renderWithProviders(
      <ItineraryDetail itinerary={TRANSIT_ITINERARY} vehicles={[{ tripId: 'T1', lat: 0, lon: 0 }]} onBack={vi.fn()} onFocusLeg={vi.fn()} />,
    );
    expect(screen.getByText('Vehículo localizado en el mapa')).toBeInTheDocument();
  });

  it('el detalle muestra los avisos del tramo sin enfocar el tramo al pulsarlos', async () => {
    const onFocusLeg = vi.fn();
    const it = itinerary([busLeg(5, 20, { alerts: ALERTS })]);
    renderWithProviders(<ItineraryDetail itinerary={it} onBack={vi.fn()} onFocusLeg={onFocusLeg} />);
    expect(screen.getByText('Huelga parcial')).toBeInTheDocument();
    expect(screen.getByText('Desvío')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Más información' })).toHaveAttribute('href', 'https://bus.test/avisos');
    expect(screen.getByRole('link', { name: 'Más información' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Servicios mínimos del 30%')).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }));
    expect(screen.getByText('Servicios mínimos del 30%')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ver menos' })).toBeInTheDocument();
    expect(onFocusLeg).not.toHaveBeenCalled();
  });
});

describe('AlertList', () => {
  it('sin avisos no pinta nada', () => {
    const { container } = renderWithProviders(<AlertList alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
