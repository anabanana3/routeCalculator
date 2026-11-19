import { describe, expect, it, vi } from 'vitest';
import { memoizeLast } from '../../../src/application/services/memoize-last.js';

describe('memoizeLast', () => {
  it('reutiliza el resultado mientras la entrada sea la misma', () => {
    const fn = vi.fn((o: { v: number }) => ({ doubled: o.v * 2 }));
    const memo = memoizeLast(fn);
    const a = { v: 1 };
    const r1 = memo(a);
    expect(memo(a)).toBe(r1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recalcula cuando cambia la identidad de la entrada', () => {
    const fn = vi.fn((o: { v: number }) => o.v * 2);
    const memo = memoizeLast(fn);
    expect(memo({ v: 1 })).toBe(2);
    expect(memo({ v: 1 })).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
