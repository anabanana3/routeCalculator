import type { RequestHandler } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  /** Peticiones permitidas por cliente y ventana (0 = sin límite). */
  max: number;
  now?: () => number;
  /** Peticiones que no cuentan (p. ej. /api/health). */
  skip?: (path: string) => boolean;
}

interface Counter {
  count: number;
  resetAt: number;
}

/** Limitador por IP de ventana fija, en memoria (suficiente para una única instancia). */
export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const now = opts.now ?? Date.now;
  const counters = new Map<string, Counter>();
  let nextSweep = 0;

  const sweep = (t: number) => {
    if (t < nextSweep) return;
    for (const [key, c] of counters) if (c.resetAt <= t) counters.delete(key);
    nextSweep = t + opts.windowMs;
  };

  return (req, res, next) => {
    if (opts.max <= 0 || opts.skip?.(req.path)) return next();
    const t = now();
    sweep(t);
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    let c = counters.get(key);
    if (!c || c.resetAt <= t) {
      c = { count: 0, resetAt: t + opts.windowMs };
      counters.set(key, c);
    }
    c.count++;
    res.setHeader('RateLimit-Limit', String(opts.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, opts.max - c.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil((c.resetAt - t) / 1000)));
    if (c.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((c.resetAt - t) / 1000)));
      res.status(429).json({ error: 'Demasiadas peticiones; inténtalo de nuevo más tarde' });
      return;
    }
    next();
  };
}
