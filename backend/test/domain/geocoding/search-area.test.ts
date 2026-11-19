import { describe, expect, it } from 'vitest';
import { expandBounds } from '../../../src/domain/geo/geo.js';
import { searchBounds, searchFocus } from '../../../src/domain/geocoding/search-area.js';

const city = { minLat: 38.2, minLon: -0.75, maxLat: 38.3, maxLon: -0.65 };
const country = { minLat: 36, minLon: -9, maxLat: 43.8, maxLon: 3.3 };

describe('searchBounds', () => {
  it('amplía los límites de la red con el margen', () => {
    expect(searchBounds(city, true, 5000)).toEqual(expandBounds(city, 5000));
  });

  it('no restringe si está desactivado o no hay límites', () => {
    expect(searchBounds(city, false, 5000)).toBeUndefined();
    expect(searchBounds(null, true, 5000)).toBeUndefined();
  });

  it('no restringe zonas enormes (feeds nacionales)', () => {
    expect(searchBounds(country, true, 5000)).toBeUndefined();
  });
});

describe('searchFocus', () => {
  it('usa el punto indicado', () => {
    expect(searchFocus({ lat: 1, lon: 2 }, city)).toEqual({ lat: 1, lon: 2 });
  });

  it('si no hay punto usa el centro de la red', () => {
    const f = searchFocus(undefined, city)!;
    expect(f.lat).toBeCloseTo(38.25, 10);
    expect(f.lon).toBeCloseTo(-0.7, 10);
  });

  it('undefined si no hay ni punto ni red', () => {
    expect(searchFocus(undefined, null)).toBeUndefined();
  });
});
