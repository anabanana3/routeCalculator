import type { RequestHandler } from 'express';
import type { Logger } from '../../../application/ports/logger.js';

/**
 * Una línea por petición. Se registra solo la ruta, sin la query: puede contener
 * búsquedas de direcciones o coordenadas del usuario.
 */
export function requestLogger(logger: Logger, now: () => bigint = process.hrtime.bigint): RequestHandler {
  return (req, res, next) => {
    const started = now();
    res.on('finish', () => {
      const ms = Number(now() - started) / 1e6;
      // originalUrl conserva el prefijo del router (/api); se descarta la query.
      const path = req.originalUrl.split('?')[0];
      const line = `${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms`;
      if (res.statusCode >= 500) logger.error(line);
      else if (res.statusCode >= 400) logger.warn(line);
      else if (path === '/api/health') logger.debug(line);
      else logger.info(line);
    });
    next();
  };
}
