import type { Cache } from '../../application/ports/cache.js';

/** Caché en memoria con caducidad y tamaño máximo (descarta primero las entradas más antiguas). */
export class TtlCache<T> implements Cache<T> {
  private readonly entries = new Map<string, { at: number; value: T }>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { at: this.now(), value });
  }

  clear(): void {
    this.entries.clear();
  }
}
