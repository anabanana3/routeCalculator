import { describe, expect, it, vi } from 'vitest';
import { cached } from '../../../src/application/ports/cache.js';
import { silentLogger } from '../../../src/application/ports/logger.js';
import { NetworkNotLoadedError } from '../../../src/application/errors.js';
import { MapCache } from '../../fixtures/fakes.js';

describe('cached', () => {
  it('calcula y guarda el valor la primera vez', async () => {
    const cache = new MapCache<number>();
    const fn = vi.fn(async () => 42);
    expect(await cached(cache, 'k', fn)).toBe(42);
    expect(await cached(cache, 'k', fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('también cachea null', async () => {
    const cache = new MapCache<number | null>();
    const fn = vi.fn(async () => null);
    await cached(cache, 'k', fn);
    await cached(cache, 'k', fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('no guarda nada si falla', async () => {
    const cache = new MapCache<number>();
    await expect(cached(cache, 'k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(cache.map.size).toBe(0);
  });
});

describe('silentLogger', () => {
  it('no escribe nada', () => {
    const spy = vi.spyOn(console, 'log');
    silentLogger.debug('a');
    silentLogger.info('a');
    silentLogger.warn('a');
    silentLogger.error('a');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('NetworkNotLoadedError', () => {
  it('tiene nombre y mensaje propios', () => {
    const e = new NetworkNotLoadedError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('NetworkNotLoadedError');
    expect(e.message).toMatch(/GTFS/);
  });
});
