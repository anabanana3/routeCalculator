import type { RequestHandler } from 'express';

/** Cabeceras de seguridad para una API que solo devuelve JSON. */
export function securityHeaders(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    // Las respuestas contienen ubicaciones del usuario: que no se guarden en cachés intermedias.
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
}
