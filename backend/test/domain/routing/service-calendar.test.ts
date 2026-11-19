import { describe, expect, it } from 'vitest';
import type { Service } from '../../../src/domain/network/model.js';
import { isServiceActive, ServiceCalendar } from '../../../src/domain/routing/service-calendar.js';

const weekdays: Service = {
  id: 'WK',
  days: 0b0011111,
  start: '20260101',
  end: '20261231',
  added: new Set(['20260307']),
  removed: new Set(['20260303']),
};
const onlyDates: Service = { id: 'X', days: 0, start: '', end: '', added: new Set(['20260308']), removed: new Set() };

describe('isServiceActive', () => {
  it('activo los días de la semana marcados dentro del rango', () => {
    expect(isServiceActive(weekdays, '20260302')).toBe(true); // lunes
    expect(isServiceActive(weekdays, '20260306')).toBe(true); // viernes
    expect(isServiceActive(weekdays, '20260314')).toBe(false); // sábado
  });

  it('respeta las excepciones de calendar_dates', () => {
    expect(isServiceActive(weekdays, '20260303')).toBe(false); // martes suprimido
    expect(isServiceActive(weekdays, '20260307')).toBe(true); // sábado añadido
  });

  it('inactivo fuera del rango de fechas', () => {
    expect(isServiceActive(weekdays, '20251231')).toBe(false);
    expect(isServiceActive(weekdays, '20270101')).toBe(false);
  });

  it('servicios solo con calendar_dates', () => {
    expect(isServiceActive(onlyDates, '20260308')).toBe(true);
    expect(isServiceActive(onlyDates, '20260309')).toBe(false);
  });

  it('una supresión prevalece sobre un alta del mismo día', () => {
    const s: Service = { ...onlyDates, removed: new Set(['20260308']) };
    expect(isServiceActive(s, '20260308')).toBe(false);
  });
});

describe('ServiceCalendar', () => {
  it('calcula la máscara de servicios activos', () => {
    const cal = new ServiceCalendar([weekdays, onlyDates]);
    expect([...cal.activeOn('20260302')]).toEqual([1, 0]);
    expect([...cal.activeOn('20260308')]).toEqual([0, 1]);
  });

  it('cachea el resultado por fecha', () => {
    const cal = new ServiceCalendar([weekdays]);
    expect(cal.activeOn('20260302')).toBe(cal.activeOn('20260302'));
  });

  it('limita el tamaño de la caché', () => {
    const cal = new ServiceCalendar([weekdays]);
    const first = cal.activeOn('20260101');
    for (let d = 2; d <= 31; d++) cal.activeOn(`202601${String(d).padStart(2, '0')}`);
    expect(cal.activeOn('20260101')).not.toBe(first);
    expect([...cal.activeOn('20260101')]).toEqual([...first]);
  });

  it('en modo depuración todos los servicios están activos', () => {
    const cal = new ServiceCalendar([weekdays, onlyDates], true);
    expect([...cal.activeOn('20300101')]).toEqual([1, 1]);
  });
});
