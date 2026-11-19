import type { ErrorRequestHandler, RequestHandler } from 'express';
import { NetworkNotLoadedError } from '../../../application/errors.js';
import type { Logger } from '../../../application/ports/logger.js';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'No encontrado' });
};

interface HttpLikeError {
  status?: number;
  type?: string;
}

/** Traduce errores a respuestas JSON sin filtrar detalles internos al cliente. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    if (err instanceof NetworkNotLoadedError) {
      res.status(503).json({ error: err.message });
      return;
    }
    const e = (err ?? {}) as HttpLikeError;
    // Errores de body-parser (JSON mal formado, cuerpo demasiado grande...).
    if (typeof e.status === 'number' && e.status >= 400 && e.status < 500) {
      const message =
        e.type === 'entity.too.large'
          ? 'Petición demasiado grande'
          : e.type === 'entity.parse.failed'
            ? 'JSON no válido'
            : 'Petición no válida';
      res.status(e.status).json({ error: message });
      return;
    }
    logger.error(`Error no controlado en ${req.method} ${req.originalUrl.split('?')[0]}`, err);
    res.status(500).json({ error: 'Error interno del servidor' });
  };
}
