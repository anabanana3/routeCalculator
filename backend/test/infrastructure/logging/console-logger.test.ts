import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  parseLogLevel,
  sanitizeLogText,
  setLogLevel,
} from '../../../src/infrastructure/logging/console-logger.js';

const NOW = () => new Date('2026-03-02T10:00:00.000Z');

function sink() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

afterEach(() => setLogLevel('info'));

describe('parseLogLevel', () => {
  it('acepta niveles conocidos sin distinguir mayúsculas', () => {
    expect(parseLogLevel('DEBUG')).toBe('debug');
    expect(parseLogLevel(' warn ')).toBe('warn');
    expect(parseLogLevel('silent')).toBe('silent');
  });

  it('usa info con valores desconocidos o propiedades heredadas', () => {
    expect(parseLogLevel(undefined)).toBe('info');
    expect(parseLogLevel('verbose')).toBe('info');
    expect(parseLogLevel('constructor')).toBe('info');
    expect(parseLogLevel('__proto__')).toBe('info');
  });
});

describe('sanitizeLogText', () => {
  it('escapa saltos de línea y caracteres de control (log injection)', () => {
    expect(sanitizeLogText('a\nINFO falso\r\tb')).toBe('a\\nINFO falso\\r\\tb');
    expect(sanitizeLogText('x\u001b[31my')).toBe('x\\u001b[31my');
    expect(sanitizeLogText('l\u2028m')).toBe('l\\u2028m');
  });

  it('no toca el texto normal', () => {
    expect(sanitizeLogText('Estación Ñ 100%')).toBe('Estación Ñ 100%');
  });
});

describe('createLogger', () => {
  it('formatea la línea con fecha, nivel y ámbito', () => {
    const out = sink();
    createLogger('gtfs', out, NOW).info('cargado');
    expect(out.log).toHaveBeenCalledWith('2026-03-02T10:00:00.000Z INFO  [gtfs] cargado');
  });

  it('envía warn y error a su salida y añade el extra', () => {
    const out = sink();
    const log = createLogger('x', out, NOW);
    const err = new Error('e');
    log.warn('cuidado');
    log.error('fallo', err);
    expect(out.warn).toHaveBeenCalledWith('2026-03-02T10:00:00.000Z WARN  [x] cuidado');
    expect(out.error).toHaveBeenCalledWith('2026-03-02T10:00:00.000Z ERROR [x] fallo', err);
  });

  it('filtra por nivel', () => {
    const out = sink();
    const log = createLogger('x', out, NOW);
    log.debug('oculto');
    expect(out.log).not.toHaveBeenCalled();
    setLogLevel('debug');
    log.debug('visible');
    expect(out.log).toHaveBeenCalledTimes(1);
    setLogLevel('silent');
    log.error('nada');
    expect(out.error).not.toHaveBeenCalled();
  });

  it('sanea el mensaje', () => {
    const out = sink();
    createLogger('x', out, NOW).info('a\nb');
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining('a\\nb'));
  });

  it('usa la consola por defecto', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createLogger('x').info('hola');
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/INFO {2}\[x\] hola$/));
  });
});
