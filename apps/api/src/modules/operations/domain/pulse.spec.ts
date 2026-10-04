import { detectAnomalies, detectAnomaly } from './anomaly';
import { neighborhoodRisk, riskLevelOf } from './neighborhood-risk';

const base = {
  open: 0,
  openCritical: 0,
  slaTracked: 0,
  slaBreached: 0,
  last30: 0,
  previous30: 0,
  avgResolutionMinutes: null,
};

describe('neighborhoodRisk', () => {
  it('is 0 / LOW for a quiet neighbourhood', () => {
    expect(neighborhoodRisk(base)).toMatchObject({ riskScore: 0, riskLevel: 'LOW' });
  });

  it('is 100 / CRITICAL when every component is saturated', () => {
    const result = neighborhoodRisk({
      open: 12,
      openCritical: 12,
      slaTracked: 10,
      slaBreached: 10,
      last30: 20,
      previous30: 2,
      avgResolutionMinutes: 10 * 24 * 60,
    });
    expect(result).toMatchObject({ riskScore: 100, riskLevel: 'CRITICAL' });
  });

  it('explains the score with weighted factors that add up', () => {
    const result = neighborhoodRisk({
      ...base,
      open: 5,
      slaTracked: 10,
      slaBreached: 4,
      avgResolutionMinutes: 84 * 60,
    });
    // openLoad 0.5·25 = 12.5 · slaBreach 0.4·30 = 12 · slowResolution 0.5·15 = 7.5
    expect(result.riskScore).toBe(32);
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.riskFactors.map((f) => [f.key, f.points])).toEqual([
      ['openLoad', 12.5],
      ['slaBreach', 12],
      ['slowResolution', 7.5],
      ['criticalShare', 0],
      ['growth', 0],
    ]);
    expect(result.riskFactors[1].detail).toBe("4/10 talep SLA'yı aştı (%40)");
  });

  it('only counts growth, never a decrease', () => {
    const shrinking = neighborhoodRisk({ ...base, last30: 1, previous30: 10 });
    expect(shrinking.riskFactors.find((f) => f.key === 'growth')?.value).toBe(0);
  });

  it.each([
    [0, 'LOW'],
    [24, 'LOW'],
    [25, 'MEDIUM'],
    [50, 'HIGH'],
    [75, 'CRITICAL'],
  ] as const)('maps %i to %s', (score, level) => {
    expect(riskLevelOf(score)).toBe(level);
  });
});

describe('detectAnomaly', () => {
  const counts = (last7: number, previous28: number) => ({
    neighborhoodId: 'n1',
    neighborhoodName: 'Karataş',
    categoryId: 'c1',
    categoryName: 'Yol Çukuru',
    last7,
    previous28,
  });

  it('reports a clear increase with an honest message', () => {
    const anomaly = detectAnomaly(counts(5, 11)); // baseline 2.75/week
    expect(anomaly).toMatchObject({ increasePercent: 82, severity: 'MEDIUM', baselineWeekly: 2.8 });
    expect(anomaly?.message).toBe(
      "Karataş Mahallesi'nde yol çukuru bildirimleri son 7 günde normalin %82 üzerinde (5 bildirim; önceki 4 haftanın haftalık ortalaması 2,8).",
    );
  });

  it('never claims an anomaly under the minimum sample', () => {
    expect(detectAnomaly(counts(2, 0))).toBeNull(); // 2 reports, empty baseline
    expect(detectAnomaly(counts(2, 1))).toBeNull();
  });

  it('ignores normal fluctuation', () => {
    expect(detectAnomaly(counts(4, 12))).toBeNull(); // 3/week → 4 is +33 %
    expect(detectAnomaly(counts(6, 20))).toBeNull(); // 5/week → 6 is +1 only
  });

  it('describes a new problem without inventing a percentage', () => {
    expect(detectAnomaly(counts(3, 0))).toMatchObject({
      increasePercent: null,
      severity: 'HIGH',
      message:
        "Karataş Mahallesi'nde yol çukuru bildirimleri son 7 günde 3 adet; önceki 4 haftada hiç yoktu.",
    });
  });

  it('sorts the strongest signals first', () => {
    const list = detectAnomalies([counts(5, 11), counts(3, 0), counts(1, 0), counts(9, 8)]);
    expect(list.map((a) => a.increasePercent)).toEqual([null, 350, 82]);
  });
});
