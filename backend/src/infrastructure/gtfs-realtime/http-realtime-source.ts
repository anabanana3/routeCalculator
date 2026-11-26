import type { RealtimeFeedSource } from '../../application/ports/realtime-feed-source.js';
import type { RealtimeFeed } from '../../domain/realtime/model.js';
import { type FetchFn, readBodyWithLimit } from '../http/http-utils.js';
import { decodeRealtimeFeed } from './protobuf-decoder.js';

export interface HttpRealtimeOptions {
  timeoutMs: number;
  maxBytes: number;
  /** Cabeceras extra (p. ej. la clave de acceso del proveedor). */
  headers?: Record<string, string>;
  /** Idioma preferido para los textos de los avisos. */
  language?: string;
  fetchFn?: FetchFn;
}

/** Feed GTFS-Realtime (protobuf) servido por HTTP. Usa ETag/Last-Modified para no descargar lo que no ha cambiado. */
export class HttpRealtimeFeedSource implements RealtimeFeedSource {
  private etag?: string;
  private lastModified?: string;

  constructor(
    readonly name: string,
    private readonly url: string,
    private readonly opts: HttpRealtimeOptions,
  ) {}

  async fetch(): Promise<RealtimeFeed | null> {
    const headers: Record<string, string> = {
      Accept: 'application/x-protobuf, application/octet-stream',
      ...this.opts.headers,
    };
    if (this.etag) headers['If-None-Match'] = this.etag;
    if (this.lastModified) headers['If-Modified-Since'] = this.lastModified;

    const res = await (this.opts.fetchFn ?? fetch)(this.url, { headers, signal: AbortSignal.timeout(this.opts.timeoutMs) });
    if (res.status === 304) return null;
    // El mensaje no incluye la URL: puede contener claves de acceso.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await readBodyWithLimit(res, this.opts.maxBytes);
    let feed: RealtimeFeed;
    try {
      feed = decodeRealtimeFeed(body, this.opts.language);
    } catch (err) {
      throw new Error(`respuesta que no es GTFS-Realtime válido (${(err as Error).message})`);
    }
    this.etag = res.headers.get('etag') ?? undefined;
    this.lastModified = res.headers.get('last-modified') ?? undefined;
    return feed;
  }
}
