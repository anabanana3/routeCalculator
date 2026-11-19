import { describe, expect, it } from 'vitest';
import { joinUnique, normalizeText } from '../../../src/domain/geocoding/text.js';

describe('normalizeText', () => {
  it('quita acentos y pasa a minúsculas', () => {
    expect(normalizeText('Estación Ópera')).toBe('estacion opera');
  });

  it('conserva la ñ', () => {
    expect(normalizeText('Peña')).toBe('pena');
    expect(normalizeText('ñ')).toBe('n');
  });

  it('sustituye signos por espacios y compacta espacios', () => {
    expect(normalizeText('  Av. Libertad,  12 / B  ')).toBe('av libertad 12 b');
  });

  it('cadena vacía', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('¿?¡!')).toBe('');
  });
});

describe('joinUnique', () => {
  it('une partes no vacías', () => {
    expect(joinUnique(['Calle Mayor', undefined, ' 3 ', ''])).toBe('Calle Mayor, 3');
  });

  it('omite repeticiones sin distinguir mayúsculas', () => {
    expect(joinUnique(['Elche', 'ELCHE', 'Alicante'])).toBe('Elche, Alicante');
  });

  it('devuelve undefined si no queda nada', () => {
    expect(joinUnique([])).toBeUndefined();
    expect(joinUnique([undefined, '  '])).toBeUndefined();
  });
});
