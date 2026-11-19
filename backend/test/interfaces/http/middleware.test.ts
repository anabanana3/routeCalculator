import express, { type RequestHandler } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { NetworkNotLoadedError } from '../../../src/application/errors.js';
import { requireAdminToken, safeEqual } from '../../../src/interfaces/http/middleware/admin-auth.js';
import { errorHandler, notFound } from '../../../src/interfaces/http/middleware/error-handler.js';
import { rateLimit } from '../../../src/interfaces/http/middleware/rate-limit.js';
import { requestLogger } from '../../../src/interfaces/http/middleware/request-logger.js';
import { securityHeaders } from '../../../src/interfaces/http/middleware/security-headers.js';
import { fakeLogger } from '../../fixtures/fakes.js';
import { listen } from '../../fixtures/http.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function serve(...middleware: RequestHandler[]) {
  const app = express();
  app.use(...middleware);
  app.get('/api/x', (_req, res) => {
    res.json({ ok: true });
  });
  app.post('/api/x', (_req, res) => {
    res.json({ ok: true });
  });
  const s = await listen(app);
  close = s.close;
  return s.url;
}

describe('securityHeaders', () => {
  it('añade las cabeceras de seguridad', async () => {
    const url = await serve(securityHeaders());
    const res = await fetch(`${url}/api/x`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-site');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('rateLimit', () => {
  it('limita las peticiones por IP y ventana', async () => {
    let t = 0;
    const url = await serve(rateLimit({ windowMs: 1000, max: 2, now: () => t }));
    expect((await fetch(`${url}/api/x`)).status).toBe(200);
    const second = await fetch(`${url}/api/x`);
    expect(second.headers.get('ratelimit-limit')).toBe('2');
    expect(second.headers.get('ratelimit-remaining')).toBe('0');
    const third = await fetch(`${url}/api/x`);
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBe('1');
    expect(await third.json()).toEqual({ error: expect.stringMatching(/Demasiadas peticiones/) });
    t = 1000;
    expect((await fetch(`${url}/api/x`)).status).toBe(200);
  });

  it('no limita si max = 0 o la ruta está excluida', async () => {
    const url = await serve(rateLimit({ windowMs: 1000, max: 0 }));
    for (let i = 0; i < 3; i++) expect((await fetch(`${url}/api/x`)).status).toBe(200);
    await close!();
    const url2 = await serve(rateLimit({ windowMs: 1000, max: 1, skip: (p) => p === '/api/x' }));
    for (let i = 0; i < 3; i++) expect((await fetch(`${url2}/api/x`)).status).toBe(200);
  });

  it('reinicia el contador al empezar una ventana nueva', async () => {
    let t = 0;
    const url = await serve(rateLimit({ windowMs: 1000, max: 1, now: () => t }));
    await fetch(`${url}/api/x`);
    t = 5000;
    expect((await fetch(`${url}/api/x`)).headers.get('ratelimit-remaining')).toBe('0');
  });
});

describe('requireAdminToken', () => {
  const TOKEN = 'token-de-administracion-123';

  it('sin token configurado deshabilita el endpoint', async () => {
    const url = await serve(requireAdminToken(''));
    const res = await fetch(`${url}/api/x`, { method: 'POST', headers: { Authorization: 'Bearer ' } });
    expect(res.status).toBe(403);
  });

  it('exige el token correcto', async () => {
    const url = await serve(requireAdminToken(TOKEN));
    const none = await fetch(`${url}/api/x`, { method: 'POST' });
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toBe('Bearer');
    expect((await fetch(`${url}/api/x`, { method: 'POST', headers: { Authorization: 'Bearer otro' } })).status).toBe(401);
    expect((await fetch(`${url}/api/x`, { method: 'POST', headers: { Authorization: TOKEN } })).status).toBe(401);
    expect((await fetch(`${url}/api/x`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
    expect((await fetch(`${url}/api/x`, { method: 'POST', headers: { Authorization: `bearer  ${TOKEN} ` } })).status).toBe(200);
  });

  it('safeEqual compara secretos de cualquier longitud', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('requestLogger', () => {
  it('registra método, ruta sin query, estado y duración', async () => {
    const logger = fakeLogger();
    let t = 0n;
    const url = await serve(requestLogger(logger, () => (t += 1_500_000n)));
    await fetch(`${url}/api/x?q=calle%20secreta`);
    await fetch(`${url}/api/nope`);
    expect(logger.info).toHaveBeenCalledWith('GET /api/x 200 1.5ms');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/^GET \/api\/nope 404/));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secreta');
  });

  it('health va a debug y los 5xx a error', async () => {
    const logger = fakeLogger();
    const app = express();
    app.use(requestLogger(logger));
    app.get('/api/health', (_req, res) => {
      res.json({});
    });
    app.get('/boom', (_req, res) => {
      res.status(500).end();
    });
    const s = await listen(app);
    close = s.close;
    await fetch(`${s.url}/api/health`);
    await fetch(`${s.url}/boom`);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringMatching(/^GET \/api\/health 200/));
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^GET \/boom 500/));
  });
});

describe('errorHandler / notFound', () => {
  async function serveErrors(logger = fakeLogger()) {
    const app = express();
    app.use(express.json({ limit: '10b' }));
    app.get('/not-loaded', () => {
      throw new NetworkNotLoadedError();
    });
    app.get('/boom', () => {
      throw new Error('detalle interno /etc/secreto');
    });
    app.get('/teapot', () => {
      throw Object.assign(new Error('x'), { status: 418 });
    });
    app.post('/json', (_req, res) => {
      res.json({});
    });
    app.use(notFound);
    app.use(errorHandler(logger));
    const s = await listen(app);
    close = s.close;
    return { url: s.url, logger };
  }

  it('red no cargada -> 503', async () => {
    const { url } = await serveErrors();
    const res = await fetch(`${url}/not-loaded`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Los datos GTFS todavía no están cargados' });
  });

  it('errores no controlados -> 500 sin detalles', async () => {
    const { url, logger } = await serveErrors();
    const res = await fetch(`${url}/boom?x=1`);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('{"error":"Error interno del servidor"}');
    expect(logger.error).toHaveBeenCalledWith('Error no controlado en GET /boom', expect.any(Error));
  });

  it('JSON inválido -> 400, cuerpo grande -> 413, otros 4xx se respetan', async () => {
    const { url } = await serveErrors();
    const bad = await fetch(`${url}/json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{x' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'JSON no válido' });
    const big = await fetch(`${url}/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 'x'.repeat(100) }),
    });
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: 'Petición demasiado grande' });
    const teapot = await fetch(`${url}/teapot`);
    expect(teapot.status).toBe(418);
    expect(await teapot.json()).toEqual({ error: 'Petición no válida' });
  });

  it('rutas inexistentes -> 404 JSON', async () => {
    const { url } = await serveErrors();
    const res = await fetch(`${url}/nada`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No encontrado' });
  });
});
