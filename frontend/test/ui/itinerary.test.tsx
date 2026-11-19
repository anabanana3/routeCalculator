import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItineraryDetail } from '../../src/ui/components/ItineraryDetail';
import { ItineraryList } from '../../src/ui/components/ItineraryList';
import { busLeg, itinerary, NOW, renderWithProviders, TRANSIT_ITINERARY, walkLeg, WALK_ITINERARY } from '../fixtures';

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
