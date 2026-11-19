import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Compara secretos en tiempo constante (también si tienen longitudes distintas). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Protege endpoints de administración con "Authorization: Bearer <ADMIN_TOKEN>".
 * Si no hay token configurado, el endpoint queda deshabilitado.
 */
export function requireAdminToken(token: string): RequestHandler {
  return (req, res, next) => {
    if (!token) {
      res.status(403).json({ error: 'Operación deshabilitada: configura ADMIN_TOKEN en el servidor' });
      return;
    }
    const header = req.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || !safeEqual(match[1].trim(), token)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    next();
  };
}
