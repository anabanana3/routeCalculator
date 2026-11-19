import { describe, expect, it, vi } from 'vitest';
import { getJson, readBodyWithLimit, redactUrl, ResponseTooLargeError } from '../../../src/infrastructure/http/http-utils.js';

function streamResponse(chunks: string[], headers: Record<string, string> = {}) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(stream, { headers });
}

describe('readBodyWithLimit', () => {
  it('lee el cuerpo completo', async () => {
    expect((await readBodyWithLimit(streamResponse(['ab', 'cd']), 10)).toString()).toBe('abcd');
  });

  it('corta si el cuerpo supera el límite aunque no declare tamaño', async () => {
    await expect(readBodyWithLimit(streamResponse(['abc', 'def']), 5)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('rechaza de entrada si Content-Length supera el límite', async () => {
    const res = streamResponse(['x'], { 'content-length': '999' });
    await expect(readBodyWithLimit(res, 10)).rejects.toThrow(/tamaño máximo permitido \(10 bytes\)/);
  });

  it('cuerpo vacío', async () => {
    expect((await readBodyWithLimit(new Response(null), 10)).length).toBe(0);
  });
});

describe('redactUrl', () => {
  it('quita credenciales, query y fragmento', () => {
    expect(redactUrl('https://u:p@example.com:8443/a/b.zip?key=1#x')).toBe('https://example.com:8443/a/b.zip');
  });

  it('no falla con URLs inválidas', () => {
    expect(redactUrl('no es url')).toBe('[URL no válida]');
  });
});

describe('getJson', () => {
  it('envía User-Agent y devuelve el JSON', async () => {
    const fetchFn = vi.fn(async () => new Response('{"ok":true}'));
    const data = await getJson<{ ok: boolean }>({
      url: 'https://x.test/a',
      userAgent: 'test/1',
      timeoutMs: 1000,
      maxBytes: 100,
      service: 'X',
      fetchFn,
    });
    expect(data).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledWith('https://x.test/a', {
      headers: { 'User-Agent': 'test/1', Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    });
  });

  it('falla con estados HTTP de error', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 429 }));
    await expect(
      getJson({ url: 'https://x.test', userAgent: 'a', timeoutMs: 1000, maxBytes: 100, service: 'Photon', fetchFn }),
    ).rejects.toThrow('Photon respondió HTTP 429');
  });

  it('limita el tamaño de la respuesta', async () => {
    const fetchFn = vi.fn(async () => new Response('x'.repeat(200)));
    await expect(
      getJson({ url: 'https://x.test', userAgent: 'a', timeoutMs: 1000, maxBytes: 100, service: 'X', fetchFn }),
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('falla con JSON inválido', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>'));
    await expect(
      getJson({ url: 'https://x.test', userAgent: 'a', timeoutMs: 1000, maxBytes: 100, service: 'X', fetchFn }),
    ).rejects.toThrow(SyntaxError);
  });
});
