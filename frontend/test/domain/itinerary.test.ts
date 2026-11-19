import { describe, expect, it } from 'vitest';
import {
  compactMinutes,
  DEFAULT_ROUTE_COLOR,
  firstTransitLeg,
  isWalk,
  legColor,
  otherDepartures,
  rideStopsLabel,
  routeColor,
  showLegStart,
  WALK_COLOR,
} from '../../src/domain/itinerary';
import { busLeg, iso, TRANSIT_ITINERARY, walkLeg, WALK_ITINERARY } from '../fixtures';

describe('isWalk / legColor / routeColor', () => {
  it('los tramos a pie usan el color gris', () => {
    expect(isWalk(walkLeg(0, 1))).toBe(true);
    expect(legColor(walkLeg(0, 1))).toBe(WALK_COLOR);
  });

  it('los tramos en vehículo usan el color de la línea o el de por defecto', () => {
    expect(isWalk(busLeg(0, 1))).toBe(false);
    expect(legColor(busLeg(0, 1))).toBe('#D32F2F');
    expect(legColor(busLeg(0, 1, { route: undefined }))).toBe(DEFAULT_ROUTE_COLOR);
    expect(routeColor(busLeg(0, 1, { route: undefined }))).toBe(DEFAULT_ROUTE_COLOR);
    expect(routeColor(busLeg(0, 1))).toBe('#D32F2F');
  });
});

describe('firstTransitLeg', () => {
  it('devuelve el primer tramo en vehículo', () => {
    expect(firstTransitLeg(TRANSIT_ITINERARY)?.tripId).toBe('T1');
    expect(firstTransitLeg(WALK_ITINERARY)).toBeUndefined();
  });
});

describe('otherDepartures', () => {
  it('excluye la salida del propio tramo', () => {
    expect(otherDepartures(busLeg(5, 20))).toEqual([iso(15), iso(25)]);
    expect(otherDepartures(busLeg(5, 20, { nextDepartures: undefined }))).toEqual([]);
  });
});

describe('showLegStart', () => {
  it('muestra el inicio del primer tramo, de los vehículos y de tramos tras andar', () => {
    const legs = [walkLeg(0, 4), busLeg(5, 20), walkLeg(20, 23), busLeg(25, 30), busLeg(32, 40)];
    expect(legs.map((_, i) => showLegStart(legs, i))).toEqual([true, true, false, true, true]);
  });
});

describe('compactMinutes', () => {
  it('redondea con mínimo 1', () => {
    expect(compactMinutes(0)).toBe(1);
    expect(compactMinutes(89)).toBe(1);
    expect(compactMinutes(91)).toBe(2);
  });
});

describe('rideStopsLabel', () => {
  it('cuenta las intermedias más la de bajada', () => {
    expect(rideStopsLabel(busLeg(0, 1))).toBe('2 paradas');
    expect(rideStopsLabel(busLeg(0, 1, { intermediateStops: [] }))).toBe('1 parada');
    expect(rideStopsLabel(busLeg(0, 1, { intermediateStops: undefined }))).toBe('1 parada');
  });
});
