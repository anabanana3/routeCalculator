import { describe, expect, it } from 'vitest';
import { dedupeResults, type GeocodeResult } from '../../../src/domain/geocoding/place.js';

const r = (label: string, secondary?: string): GeocodeResult => ({ label, secondary, lat: 0, lon: 0, kind: 'address' });

describe('dedupeResults', () => {
  it('quita repetidos sin distinguir mayúsculas', () => {
    expect(dedupeResults([r('Calle Mayor', 'Elche'), r('calle mayor', 'ELCHE'), r('Calle Mayor', 'Alicante')])).toEqual([
      r('Calle Mayor', 'Elche'),
      r('Calle Mayor', 'Alicante'),
    ]);
  });

  it('trata igual secundario vacío y ausente', () => {
    expect(dedupeResults([r('Plaza'), r('Plaza', '')])).toHaveLength(1);
  });

  it('lista vacía', () => {
    expect(dedupeResults([])).toEqual([]);
  });
});
