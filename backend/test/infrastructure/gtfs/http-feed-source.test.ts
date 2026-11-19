import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAll } from '../../../src/domain/network/gtfs-table-source.js';
import { HttpGtfsFeedSource } from '../../../src/infrastructure/gtfs/http-feed-source.js';
import { fakeLogger } from '../../fixtures/fakes.js';
import { makeZip, MINIMAL_GTFS } from '../../fixtures/zip.js';

const URL = 'https://user:pass@example.com/feeds/gtfs.zip?api_key=SECRETO';

let cache: string;
beforeEach(() => {
  cache = mkdtempSync(path.join(tmpdir(), 'gtfs-http-'));
});
afterEach(() => rmSync(cache, { recursive: true, force: true }));

function zipResponse(headers: Record<string, string> = {}) {
  return new Response(new Uint8Array(makeZip(MINIMAL_GTFS)), { status: 200, headers });
}

function source(fetchFn: typeof fetch, extra: Partial<ConstructorParameters<typeof HttpGtfsFeedSource>[2]> = {}) {
  return new HttpGtfsFeedSource(URL, cache, { timeoutMs: 1000, maxBytes: 1024 * 1024, fetchFn, ...extra });
}

describe('HttpGtfsFeedSource', () => {
  it('descarga, guarda el zip y sus metadatos y lo extrae', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => zipResponse({ etag: '"v1"', 'last-modified': 'Mon, 02 Mar 2026 10:00:00 GMT' }));
    const src = source(fetchFn);
    expect(src.kind).toBe('url');
    const tables = await src.fetch({ force: false, hasCurrent: false });
    expect(await readAll(tables!, 'stops')).toHaveLength(2);
    expect(existsSync(path.join(cache, 'gtfs.zip'))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(cache, 'gtfs.meta.json'), 'utf8'))).toEqual({
      etag: '"v1"',
      lastModified: 'Mon, 02 Mar 2026 10:00:00 GMT',
    });
    // Primera carga: sin cabeceras condicionales y con tiempo máximo.
    expect(fetchFn).toHaveBeenCalledWith(URL, { headers: {}, signal: expect.any(AbortSignal) });
  });

  it('usa ETag/Last-Modified y devuelve null si no ha cambiado (304)', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(zipResponse({ etag: '"v1"', 'last-modified': 'ayer' }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const src = source(fetchFn);
    await src.fetch({ force: false, hasCurrent: false });
    expect(await src.fetch({ force: false, hasCurrent: true })).toBeNull();
    expect(fetchFn.mock.calls[1][1]!.headers).toEqual({ 'If-None-Match': '"v1"', 'If-Modified-Since': 'ayer' });
  });

  it('con force no envía cabeceras condicionales', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => zipResponse({ etag: '"v1"' }));
    const src = source(fetchFn);
    await src.fetch({ force: false, hasCurrent: false });
    await src.fetch({ force: true, hasCurrent: true });
    expect(fetchFn.mock.calls[1]).toEqual([URL, { headers: {}, signal: expect.any(AbortSignal) }]);
  });

  it('ignora metadatos corruptos', async () => {
    writeFileSync(path.join(cache, 'gtfs.zip'), makeZip(MINIMAL_GTFS));
    writeFileSync(path.join(cache, 'gtfs.meta.json'), '{no json');
    const fetchFn = vi.fn<typeof fetch>(async () => zipResponse());
    await source(fetchFn).fetch({ force: false, hasCurrent: true });
    expect(fetchFn.mock.calls[0][1]!.headers).toEqual({});
  });

  it('ignora metadatos con tipos inesperados', async () => {
    writeFileSync(path.join(cache, 'gtfs.zip'), makeZip(MINIMAL_GTFS));
    writeFileSync(path.join(cache, 'gtfs.meta.json'), JSON.stringify({ etag: { evil: true }, lastModified: 5 }));
    const fetchFn = vi.fn<typeof fetch>(async () => zipResponse());
    await source(fetchFn).fetch({ force: false, hasCurrent: true });
    expect(fetchFn.mock.calls[0][1]!.headers).toEqual({});
  });

  it('los errores HTTP no incluyen la URL (puede llevar claves)', async () => {
    const src = source(vi.fn<typeof fetch>(async () => new Response('x', { status: 403 })));
    const err = await src.fetch({ force: false, hasCurrent: true }).catch((e: Error) => e);
    expect((err as Error).message).toBe('HTTP 403 al descargar el GTFS');
    expect((err as Error).message).not.toContain('SECRETO');
  });

  it('en los logs la URL aparece sin credenciales ni parámetros', async () => {
    const logger = fakeLogger();
    await source(vi.fn<typeof fetch>(async () => zipResponse()), { logger }).fetch({ force: false, hasCurrent: false });
    const logged = logger.info.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('https://example.com/feeds/gtfs.zip');
    expect(logged).not.toContain('SECRETO');
    expect(logged).not.toContain('pass');
  });

  it('rechaza descargas mayores que el máximo', async () => {
    const src = source(vi.fn<typeof fetch>(async () => zipResponse()), { maxBytes: 10 });
    await expect(src.fetch({ force: false, hasCurrent: true })).rejects.toThrow(/tamaño máximo/);
  });

  it('en el arranque usa la copia en caché si la descarga falla', async () => {
    writeFileSync(path.join(cache, 'gtfs.zip'), makeZip(MINIMAL_GTFS));
    const logger = fakeLogger();
    const src = source(vi.fn<typeof fetch>(async () => Promise.reject(new Error('ECONNREFUSED'))), { logger });
    const tables = await src.fetch({ force: false, hasCurrent: false });
    expect(await readAll(tables!, 'stops')).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('usando la copia en caché'));
  });

  it('si ya hay red cargada propaga el error de descarga', async () => {
    writeFileSync(path.join(cache, 'gtfs.zip'), makeZip(MINIMAL_GTFS));
    const src = source(vi.fn<typeof fetch>(async () => Promise.reject(new Error('ECONNREFUSED'))));
    await expect(src.fetch({ force: false, hasCurrent: true })).rejects.toThrow('ECONNREFUSED');
  });

  it('falla si no hay URL', async () => {
    const src = new HttpGtfsFeedSource('', cache, { timeoutMs: 1000, maxBytes: 1000 });
    await expect(src.fetch({ force: false, hasCurrent: false })).rejects.toThrow(/GTFS_URL está vacío/);
  });
});
