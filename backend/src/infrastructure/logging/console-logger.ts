import type { Logger } from '../../application/ports/logger.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function parseLogLevel(value: string | undefined): LogLevel {
  const v = (value ?? '').trim().toLowerCase();
  return Object.hasOwn(LEVELS, v) ? (v as LogLevel) : 'info';
}

let threshold = LEVELS.info;

export function setLogLevel(level: string | undefined): void {
  threshold = LEVELS[parseLogLevel(level)];
}

/**
 * Escapa saltos de línea y caracteres de control para que un texto procedente
 * del usuario no pueda falsear líneas del log (log injection).
 */
export function sanitizeLogText(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, (c) => {
    if (c === '\n') return '\\n';
    if (c === '\r') return '\\r';
    if (c === '\t') return '\\t';
    return `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

type Sink = Pick<Console, 'log' | 'warn' | 'error'>;

export function createLogger(scope: string, sink: Sink = console, now: () => Date = () => new Date()): Logger {
  const write = (level: Exclude<LogLevel, 'silent'>, msg: string, extra?: unknown) => {
    if (LEVELS[level] < threshold) return;
    const line = `${now().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${sanitizeLogText(msg)}`;
    const out = level === 'error' ? sink.error : level === 'warn' ? sink.warn : sink.log;
    if (extra !== undefined) out(line, extra);
    else out(line);
  };
  return {
    debug: (msg, extra) => write('debug', msg, extra),
    info: (msg, extra) => write('info', msg, extra),
    warn: (msg, extra) => write('warn', msg, extra),
    error: (msg, extra) => write('error', msg, extra),
  };
}
