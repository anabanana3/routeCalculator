import { describe, expect, it } from 'vitest';
import {
  buildPlanRequest,
  GEOLOCATION_MESSAGES,
  nextActiveFieldAfterMapClick,
  otherField,
} from '../../src/domain/trip-search';
import { place } from '../fixtures';

const a = place('A', 40.4, -3.7, { secondary: 'x' });
const b = place('B', 40.5, -3.6);

describe('otherField', () => {
  it('alterna origen y destino', () => {
    expect(otherField('origin')).toBe('destination');
    expect(otherField('destination')).toBe('origin');
  });
});

describe('buildPlanRequest', () => {
  it('null si falta algún punto', () => {
    expect(buildPlanRequest(null, b, 'now', '')).toBeNull();
    expect(buildPlanRequest(a, null, 'now', '')).toBeNull();
  });

  it('solo envía coordenadas (no etiquetas ni datos del usuario)', () => {
    expect(buildPlanRequest(a, b, 'now', '2026-03-02T08:00')).toEqual({
      from: { lat: 40.4, lon: -3.7 },
      to: { lat: 40.5, lon: -3.6 },
    });
  });

  it('con hora de salida la convierte a ISO', () => {
    const req = buildPlanRequest(a, b, 'at', '2026-03-02T08:00')!;
    expect(req.dateTime).toBe(new Date('2026-03-02T08:00').toISOString());
  });

  it('con una hora vacía o inválida no falla y sale ahora', () => {
    expect(buildPlanRequest(a, b, 'at', '')).not.toHaveProperty('dateTime');
    expect(buildPlanRequest(a, b, 'at', 'basura')).not.toHaveProperty('dateTime');
  });
});

describe('nextActiveFieldAfterMapClick', () => {
  it('pasa al campo que falta', () => {
    expect(nextActiveFieldAfterMapClick('origin', null, null)).toBe('destination');
    expect(nextActiveFieldAfterMapClick('destination', null, b)).toBe('origin');
  });

  it('mantiene el campo si el otro ya está elegido', () => {
    expect(nextActiveFieldAfterMapClick('origin', a, b)).toBe('origin');
    expect(nextActiveFieldAfterMapClick('destination', a, null)).toBe('destination');
  });
});

describe('GEOLOCATION_MESSAGES', () => {
  it('tiene mensaje para cada fallo', () => {
    expect(Object.keys(GEOLOCATION_MESSAGES).sort()).toEqual(['denied', 'unavailable', 'unsupported']);
  });
});
