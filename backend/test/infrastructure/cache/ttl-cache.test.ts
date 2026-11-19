import { describe, expect, it } from 'vitest';
import { TtlCache } from '../../../src/infrastructure/cache/ttl-cache.js';

describe('TtlCache', () => {
  it('guarda y devuelve valores', () => {
    const c = new TtlCache<number>(10, 1000);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
  });

  it('caduca las entradas', () => {
    let t = 0;
    const c = new TtlCache<string>(10, 1000, () => t);
    c.set('a', 'x');
    t = 999;
    expect(c.get('a')).toBe('x');
    t = 1000;
    expect(c.get('a')).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it('descarta la entrada más antigua al llenarse', () => {
    const c = new TtlCache<number>(2, 1000);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.size).toBe(2);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });

  it('reescribir una clave la renueva sin expulsar a otra', () => {
    const c = new TtlCache<number>(2, 1000);
    c.set('a', 1);
    c.set('b', 2);
    c.set('a', 10);
    expect(c.size).toBe(2);
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(10);
  });

  it('guarda null', () => {
    const c = new TtlCache<number | null>(2, 1000);
    c.set('a', null);
    expect(c.get('a')).toBeNull();
  });

  it('clear vacía la caché', () => {
    const c = new TtlCache<number>(2, 1000);
    c.set('a', 1);
    c.clear();
    expect(c.size).toBe(0);
  });
});
