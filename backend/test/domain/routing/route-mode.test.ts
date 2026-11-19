import { describe, expect, it } from 'vitest';
import { routeTypeToMode } from '../../../src/domain/routing/route-mode.js';

describe('routeTypeToMode', () => {
  it.each([
    [0, 'TRAM'],
    [1, 'SUBWAY'],
    [2, 'RAIL'],
    [3, 'BUS'],
    [4, 'FERRY'],
    [5, 'CABLE_CAR'],
    [6, 'GONDOLA'],
    [7, 'FUNICULAR'],
    [11, 'TROLLEYBUS'],
    [12, 'MONORAIL'],
  ])('tipo básico %i -> %s', (type, mode) => {
    expect(routeTypeToMode(type)).toBe(mode);
  });

  it.each([
    [100, 'RAIL'],
    [199, 'RAIL'],
    [400, 'SUBWAY'],
    [499, 'SUBWAY'],
    [800, 'TROLLEYBUS'],
    [900, 'TRAM'],
    [999, 'TRAM'],
    [1000, 'FERRY'],
    [1200, 'FERRY'],
    [1300, 'GONDOLA'],
    [1400, 'FUNICULAR'],
    [700, 'BUS'],
    [8, 'BUS'],
    [-1, 'BUS'],
  ])('tipo extendido %i -> %s', (type, mode) => {
    expect(routeTypeToMode(type)).toBe(mode);
  });
});
