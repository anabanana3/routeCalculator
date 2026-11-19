export interface Cache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
}

/** Devuelve el valor cacheado o lo calcula y lo guarda. */
export async function cached<T>(cache: Cache<T>, key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  cache.set(key, value);
  return value;
}
