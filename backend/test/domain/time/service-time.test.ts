import { describe, expect, it } from 'vitest';
import {
  addDays,
  epochToServiceDate,
  formatGtfsTime,
  parseGtfsTime,
  SECONDS_PER_DAY,
  serviceDayBaseEpoch,
  weekdayMonday0,
  zonedToEpoch,
} from '../../../src/domain/time/service-time.js';

const TZ = 'Europe/Madrid';

describe('zonedToEpoch', () => {
  it('convierte una hora local de invierno (UTC+1)', () => {
    expect(zonedToEpoch(2026, 3, 2, 8, 0, 0, TZ)).toBe(Date.parse('2026-03-02T07:00:00Z'));
  });

  it('convierte una hora local de verano (UTC+2)', () => {
    expect(zonedToEpoch(2026, 7, 27, 10, 30, 15, TZ)).toBe(Date.parse('2026-07-27T08:30:15Z'));
  });

  it('funciona justo después del cambio de hora', () => {
    expect(zonedToEpoch(2026, 3, 29, 3, 0, 0, TZ)).toBe(Date.parse('2026-03-29T01:00:00Z'));
  });

  it('UTC no tiene desfase', () => {
    expect(zonedToEpoch(2026, 1, 1, 0, 0, 0, 'UTC')).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });
});

describe('epochToServiceDate', () => {
  it('usa la fecha local de la zona horaria', () => {
    expect(epochToServiceDate(Date.parse('2026-03-01T23:30:00Z'), TZ)).toBe('20260302');
    expect(epochToServiceDate(Date.parse('2026-03-01T23:30:00Z'), 'UTC')).toBe('20260301');
  });
});

describe('serviceDayBaseEpoch', () => {
  it('es mediodía menos 12 horas', () => {
    expect(serviceDayBaseEpoch('20260302', TZ)).toBe(Date.parse('2026-03-01T23:00:00Z'));
  });

  it('en el día del cambio de hora no coincide con la medianoche', () => {
    // Mediodía CEST (10:00Z) - 12h = 22:00Z del día anterior (la medianoche local fue 23:00Z).
    expect(serviceDayBaseEpoch('20260329', TZ)).toBe(Date.parse('2026-03-28T22:00:00Z'));
  });
});

describe('addDays', () => {
  it('suma y resta días cruzando meses y años', () => {
    expect(addDays('20261231', 1)).toBe('20270101');
    expect(addDays('20260301', -1)).toBe('20260228');
    expect(addDays('20240228', 1)).toBe('20240229');
    expect(addDays('20260115', 0)).toBe('20260115');
  });
});

describe('weekdayMonday0', () => {
  it('lunes = 0 ... domingo = 6', () => {
    expect(weekdayMonday0('20260302')).toBe(0);
    expect(weekdayMonday0('20260306')).toBe(4);
    expect(weekdayMonday0('20260308')).toBe(6);
  });
});

describe('parseGtfsTime', () => {
  it('parsea HH:MM:SS, también con horas >= 24', () => {
    expect(parseGtfsTime('08:00:00')).toBe(8 * 3600);
    expect(parseGtfsTime('25:10:05')).toBe(25 * 3600 + 10 * 60 + 5);
    expect(parseGtfsTime(' 7:05:00 ')).toBe(7 * 3600 + 5 * 60);
  });

  it('admite HH:MM', () => {
    expect(parseGtfsTime('08:30')).toBe(8 * 3600 + 30 * 60);
  });

  it('devuelve -1 si está vacío o es inválido', () => {
    expect(parseGtfsTime(undefined)).toBe(-1);
    expect(parseGtfsTime('')).toBe(-1);
    expect(parseGtfsTime('8')).toBe(-1);
    expect(parseGtfsTime('ab:cd:ef')).toBe(-1);
  });
});

describe('formatGtfsTime', () => {
  it('formatea con ceros a la izquierda', () => {
    expect(formatGtfsTime(0)).toBe('00:00:00');
    expect(formatGtfsTime(90605)).toBe('25:10:05');
  });

  it('es la inversa de parseGtfsTime', () => {
    expect(parseGtfsTime(formatGtfsTime(12345))).toBe(12345);
  });
});

it('SECONDS_PER_DAY', () => {
  expect(SECONDS_PER_DAY).toBe(86400);
});
