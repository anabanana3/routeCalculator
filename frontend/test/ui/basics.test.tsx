import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LegMode } from '../../src/domain/types/api';
import { ModeIcon, RouteBadge } from '../../src/ui/components/RouteBadge';
import { theme } from '../../src/ui/theme';
import { useTimeZone } from '../../src/ui/time-zone';

const route = { id: 'R', shortName: 'L1', longName: 'Larga', type: 3, color: '#D32F2F', textColor: '#FFFFFF' };

describe('ModeIcon', () => {
  it.each<[LegMode, string]>([
    ['WALK', 'DirectionsWalkIcon'],
    ['TRAM', 'TramIcon'],
    ['SUBWAY', 'DirectionsSubwayIcon'],
    ['MONORAIL', 'DirectionsSubwayIcon'],
    ['RAIL', 'DirectionsRailwayIcon'],
    ['FUNICULAR', 'DirectionsRailwayIcon'],
    ['FERRY', 'DirectionsBoatIcon'],
    ['BUS', 'DirectionsBusIcon'],
    ['GONDOLA', 'DirectionsBusIcon'],
  ])('%s -> %s', (mode, icon) => {
    render(<ModeIcon mode={mode} />);
    expect(screen.getByTestId(icon)).toBeInTheDocument();
  });
});

describe('RouteBadge', () => {
  it('muestra el nombre corto con los colores de la línea', () => {
    render(<RouteBadge route={route} mode="BUS" />);
    const badge = screen.getByText('L1');
    expect(badge).toHaveStyle({ backgroundColor: '#D32F2F', color: '#FFFFFF', fontSize: '14px' });
    expect(screen.getByTestId('DirectionsBusIcon')).toBeInTheDocument();
  });

  it('usa el nombre largo si no hay corto y admite tamaño pequeño', () => {
    render(<RouteBadge route={{ ...route, shortName: '' }} mode="TRAM" size="small" />);
    expect(screen.getByText('Larga')).toHaveStyle({ fontSize: '12px' });
  });
});

describe('theme', () => {
  it('usa los colores corporativos', () => {
    expect(theme.palette.primary.main).toBe('#1a73e8');
    expect(theme.shape.borderRadius).toBe(12);
  });
});

describe('useTimeZone', () => {
  it('por defecto undefined (zona del navegador)', () => {
    function Probe() {
      return <span>{String(useTimeZone())}</span>;
    }
    render(<Probe />);
    expect(screen.getByText('undefined')).toBeInTheDocument();
  });
});
