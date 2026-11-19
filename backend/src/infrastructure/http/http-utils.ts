export type FetchFn = typeof fetch;

export class ResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`La respuesta supera el tamaño máximo permitido (${maxBytes} bytes)`);
    this.name = 'ResponseTooLargeError';
  }
}

/** Lee el cuerpo de una respuesta cortando la descarga si supera maxBytes. */
export async function readBodyWithLimit(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ResponseTooLargeError(maxBytes);
  if (!res.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** URL sin credenciales ni parámetros (que pueden contener claves), apta para logs. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '[URL no válida]';
  }
}

export interface JsonRequest {
  url: string;
  userAgent: string;
  timeoutMs: number;
  maxBytes: number;
  /** Nombre del servicio para los mensajes de error. */
  service: string;
  fetchFn?: FetchFn;
}

/** GET de JSON con tiempo máximo y tamaño máximo de respuesta. */
export async function getJson<T>(req: JsonRequest): Promise<T> {
  const res = await (req.fetchFn ?? fetch)(req.url, {
    headers: { 'User-Agent': req.userAgent, Accept: 'application/json' },
    signal: AbortSignal.timeout(req.timeoutMs),
  });
  if (!res.ok) throw new Error(`${req.service} respondió HTTP ${res.status}`);
  const body = await readBodyWithLimit(res, req.maxBytes);
  return JSON.parse(body.toString('utf8')) as T;
}
