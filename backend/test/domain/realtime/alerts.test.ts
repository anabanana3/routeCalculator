import { describe, expect, it } from 'vitest';
import { type AlertTarget, alertApplies, entityMatches, isAlertActive } from '../../../src/domain/realtime/alerts.js';
import { alert } from '../../fixtures/realtime.js';

const target: AlertTarget = {
  agencyId: 'AG',
  routeId: 'R1',
  routeType: 3,
  directionId: 0,
  tripId: 'T1',
  stopIds: new Set(['A', 'C']),
};

describe('isAlertActive', () => {
  it('sin periodos siempre está vigente', () => {
    expect(isAlertActive(alert('a'), 100, 200)).toBe(true);
  });

  it('vigente si algún periodo se solapa con el intervalo', () => {
    const a = alert('a', { activePeriods: [{ start: 0, end: 50 }, { start: 150 }] });
    expect(isAlertActive(a, 100, 200)).toBe(true);
    expect(isAlertActive(a, 60, 100)).toBe(false);
    expect(isAlertActive(alert('b', { activePeriods: [{ end: 99 }] }), 100, 200)).toBe(false);
  });
});

describe('entityMatches', () => {
  it('todos los campos indicados deben coincidir', () => {
    expect(entityMatches({ routeId: 'R1' }, target)).toBe(true);
    expect(entityMatches({ routeId: 'R1', stopId: 'A' }, target)).toBe(true);
    expect(entityMatches({ routeId: 'R1', stopId: 'B' }, target)).toBe(false);
    expect(entityMatches({ agencyId: 'AG' }, target)).toBe(true);
    expect(entityMatches({ agencyId: 'OTRA' }, target)).toBe(false);
    expect(entityMatches({ routeType: 3, directionId: 0 }, target)).toBe(true);
    expect(entityMatches({ routeType: 0 }, target)).toBe(false);
    expect(entityMatches({ directionId: 1 }, target)).toBe(false);
    expect(entityMatches({ tripId: 'T1' }, target)).toBe(true);
    expect(entityMatches({ tripId: 'T2' }, target)).toBe(false);
    expect(entityMatches({ routeId: 'R2' }, target)).toBe(false);
  });

  it('un selector vacío no afecta a nada', () => {
    expect(entityMatches({}, target)).toBe(false);
  });
});

describe('alertApplies', () => {
  it('combina vigencia y selectores', () => {
    const a = alert('a', { informedEntities: [{ routeId: 'R9' }, { stopId: 'C' }], activePeriods: [{ start: 0, end: 10 }] });
    expect(alertApplies(a, target, 5, 6)).toBe(true);
    expect(alertApplies(a, target, 20, 30)).toBe(false);
    expect(alertApplies(alert('b', { informedEntities: [{ routeId: 'R9' }] }), target, 5, 6)).toBe(false);
  });
});
