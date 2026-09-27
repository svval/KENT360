import { evaluateSla, formatDurationShort, SlaStatus } from '@kent360/shared-types';
import { atRiskRatioFrom, DEFAULT_SLA_AT_RISK_RATIO, slaSnapshot } from './sla-policy';

const created = new Date('2026-09-27T10:00:00Z');

describe('slaSnapshot', () => {
  it('adds the effective SLA and freezes the at-risk threshold', () => {
    const snapshot = slaSnapshot(created, 240, 0.25)!;
    expect(snapshot.slaDueAt.toISOString()).toBe('2026-09-27T14:00:00.000Z');
    expect(snapshot.slaAtRiskAt.toISOString()).toBe('2026-09-27T13:00:00.000Z');
  });

  it('returns null when no SLA is configured', () => {
    expect(slaSnapshot(created, null, 0.25)).toBeNull();
  });

  it('reads the at-risk ratio from municipality settings with a safe default', () => {
    expect(atRiskRatioFrom({ slaAtRiskRatio: 0.2 })).toBe(0.2);
    expect(atRiskRatioFrom({})).toBe(DEFAULT_SLA_AT_RISK_RATIO);
    expect(atRiskRatioFrom({ slaAtRiskRatio: 3 })).toBe(DEFAULT_SLA_AT_RISK_RATIO);
    expect(atRiskRatioFrom(null)).toBe(DEFAULT_SLA_AT_RISK_RATIO);
  });
});

describe('evaluateSla', () => {
  const snapshot = {
    slaDueAt: '2026-09-27T14:00:00Z',
    slaAtRiskAt: '2026-09-27T13:00:00Z',
    completedAt: null,
  };
  const at = (iso: string) => new Date(iso);

  it.each([
    ['2026-09-27T11:00:00Z', SlaStatus.ON_TIME, 180],
    ['2026-09-27T13:30:00Z', SlaStatus.AT_RISK, 30],
    ['2026-09-27T14:00:00Z', SlaStatus.AT_RISK, 0],
    ['2026-09-27T15:14:00Z', SlaStatus.BREACHED, -74],
  ])('open request at %s → %s (%i min)', (now, status, remaining) => {
    expect(evaluateSla(snapshot, at(now))).toEqual({ status, remainingMinutes: remaining });
  });

  it('freezes the result at completion time', () => {
    const late = { ...snapshot, completedAt: '2026-09-27T15:00:00Z' };
    const inTime = { ...snapshot, completedAt: '2026-09-27T13:50:00Z' };
    const muchLater = at('2026-12-01T00:00:00Z');
    expect(evaluateSla(late, muchLater)).toEqual({
      status: SlaStatus.BREACHED,
      remainingMinutes: -60,
    });
    expect(evaluateSla(inTime, muchLater)).toEqual({
      status: SlaStatus.ON_TIME,
      remainingMinutes: 10,
    });
  });

  it('has no status without an SLA', () => {
    expect(evaluateSla({ slaDueAt: null, slaAtRiskAt: null, completedAt: null })).toEqual({
      status: null,
      remainingMinutes: null,
    });
  });

  it.each([
    [12, '12 dk'],
    [222, '3 sa 42 dk'],
    [-74, '1 sa 14 dk'],
    [180, '3 sa'],
    [1440 * 2 + 240, '2 gün 4 sa'],
  ])('formats %i minutes as "%s"', (minutes, text) => {
    expect(formatDurationShort(minutes)).toBe(text);
  });
});
