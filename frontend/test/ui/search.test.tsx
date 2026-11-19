import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SEARCH_DEBOUNCE_MS } from '../../src/application/hooks/usePlaceSearch';
import type { SelectedPlace } from '../../src/domain/types/place';
import { OptionIcon, PlaceSearchField } from '../../src/ui/components/PlaceSearchField';
import { SearchPanel } from '../../src/ui/components/SearchPanel';
import { fakeApi, geoResult, place, renderWithProviders } from '../fixtures';

const RESULTS = [
  geoResult('Museo del Prado', 40.41, -3.69, { kind: 'poi', secondary: 'Madrid' }),
  geoResult('Sol', 40.42, -3.7, { kind: 'stop' }),
];

function field(extra: Partial<Parameters<typeof PlaceSearchField>[0]> = {}, api = fakeApi({ geocodeSearch: vi.fn(async () => ({ results: RESULTS })) })) {
  const props = {
    value: null as SelectedPlace | null,
    placeholder: 'Origen',
    icon: <span />,
    active: false,
    locating: false,
    onFocus: vi.fn(),
    onChange: vi.fn(),
    onLocate: vi.fn(),
    ...extra,
  };
  const view = renderWithProviders(<PlaceSearchField {...props} />, { api });
  return { props, api, view, input: screen.getByPlaceholderText('Origen') };
}

const waitDebounce = () => act(() => new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 50)));

describe('OptionIcon', () => {
  it.each(['current', 'stop', 'street', 'poi', 'map', 'address'] as const)('icono para %s', (kind) => {
    renderWithProviders(<OptionIcon kind={kind} />);
    expect(screen.getByTestId(`icon-${kind}`)).toBeInTheDocument();
  });
});

describe('PlaceSearchField', () => {
  it('al enfocar ofrece "Tu ubicación" y avisa del mínimo de letras', async () => {
    const { input, props } = field();
    await userEvent.click(input);
    expect(props.onFocus).toHaveBeenCalled();
    expect(screen.getByText('Tu ubicación')).toBeInTheDocument();
  });

  it('busca al escribir y elige un resultado', async () => {
    const { input, props, api } = field({ searchFocus: { lat: 1, lon: 2 } });
    await userEvent.type(input, 'museo');
    await waitDebounce();
    expect(api.geocodeSearch).toHaveBeenCalledWith('museo', { lat: 1, lon: 2 }, expect.any(AbortSignal));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('Madrid')).toBeInTheDocument();
    await userEvent.click(within(listbox).getByText('Museo del Prado'));
    expect(props.onChange).toHaveBeenCalledWith(RESULTS[0]);
  });

  it('Enter con texto libre elige el primer resultado', async () => {
    const { input, props } = field();
    await userEvent.type(input, 'museo');
    await waitDebounce();
    await screen.findByText('Sol');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onChange).toHaveBeenCalledWith(RESULTS[0]);
  });

  it('Enter sin resultados no hace nada', async () => {
    const { input, props } = field({}, fakeApi());
    await userEvent.type(input, 'xyz');
    await waitDebounce();
    await screen.findByText('Tu ubicación');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('"Tu ubicación" pide la geolocalización', async () => {
    const { input, props } = field();
    await userEvent.click(input);
    await userEvent.click(screen.getByText('Tu ubicación'));
    expect(props.onLocate).toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('mientras localiza lo indica', async () => {
    const { input } = field({ locating: true, active: true });
    await userEvent.click(input);
    expect(screen.getByText('Obteniendo tu ubicación…')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('borrar el campo envía null', async () => {
    const { props } = field({ value: place('Sol') });
    await userEvent.click(screen.getByPlaceholderText('Origen'));
    await userEvent.click(screen.getByTitle('Clear'));
    expect(props.onChange).toHaveBeenCalledWith(null);
  });

  it('refleja cambios externos del valor y restaura el texto al salir', async () => {
    const { input, view, props } = field({ value: place('Sol') });
    expect(input).toHaveValue('Sol');
    view.rerender(<PlaceSearchField {...props} value={place('Atocha', 1, 1)} />);
    expect(input).toHaveValue('Atocha');
    await userEvent.type(input, ' xx');
    fireEvent.blur(input);
    expect(input).toHaveValue('Atocha');
  });

  it('muestra el aviso del buscador', async () => {
    const api = fakeApi({ geocodeSearch: vi.fn(async () => ({ results: [], warning: 'Solo paradas' })) });
    const { input } = field({}, api);
    await userEvent.type(input, 'sol m');
    await waitDebounce();
    expect(await screen.findByText('Solo paradas')).toBeInTheDocument();
  });
});

describe('SearchPanel', () => {
  function panel(extra: Partial<Parameters<typeof SearchPanel>[0]> = {}) {
    const props = {
      origin: place('Sol'),
      destination: null,
      activeField: 'origin' as const,
      departMode: 'now' as const,
      departAt: '2026-03-02T08:00',
      locating: null,
      onActiveFieldChange: vi.fn(),
      onPlaceChange: vi.fn(),
      onSwap: vi.fn(),
      onLocate: vi.fn(),
      onDepartModeChange: vi.fn(),
      onDepartAtChange: vi.fn(),
      ...extra,
    };
    renderWithProviders(<SearchPanel {...props} />);
    return props;
  }

  it('muestra los dos campos con sus valores', () => {
    panel();
    expect(screen.getByPlaceholderText(/Origen/)).toHaveValue('Sol');
    expect(screen.getByPlaceholderText(/Destino/)).toHaveValue('');
  });

  it('enfocar un campo lo activa', async () => {
    const props = panel();
    await userEvent.click(screen.getByPlaceholderText(/Destino/));
    expect(props.onActiveFieldChange).toHaveBeenCalledWith('destination');
  });

  it('cambios de campo y ubicación llevan su campo', async () => {
    const props = panel();
    await userEvent.click(screen.getByPlaceholderText(/Destino/));
    await userEvent.click(screen.getByText('Tu ubicación'));
    expect(props.onLocate).toHaveBeenCalledWith('destination');
    await userEvent.click(screen.getByPlaceholderText(/Origen/));
    await userEvent.click(screen.getAllByTitle('Clear')[0]);
    expect(props.onPlaceChange).toHaveBeenCalledWith('origin', null);
  });

  it('intercambia', async () => {
    const props = panel();
    await userEvent.click(screen.getByRole('button', { name: 'Intercambiar' }));
    expect(props.onSwap).toHaveBeenCalled();
  });

  it('cambia el modo de salida', async () => {
    const props = panel();
    expect(screen.queryByLabelText('Fecha y hora de salida')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salir a las' }));
    expect(props.onDepartModeChange).toHaveBeenCalledWith('at');
    // Pulsar el modo ya activo no lo desactiva.
    await userEvent.click(screen.getByRole('button', { name: 'Salir ahora' }));
    expect(props.onDepartModeChange).toHaveBeenCalledTimes(1);
  });

  it('con "Salir a las" permite elegir fecha y hora', () => {
    const props = panel({ departMode: 'at' });
    const input = screen.getByLabelText('Fecha y hora de salida');
    expect(input).toHaveValue('2026-03-02T08:00');
    fireEvent.change(input, { target: { value: '2026-03-02T09:15' } });
    expect(props.onDepartAtChange).toHaveBeenCalledWith('2026-03-02T09:15');
  });
});
