/**
 * MahallePulse risk score (Phase 10) – deterministic and explainable, NOT AI.
 * Five components, each normalised to 0–1 and weighted; the score is their weighted
 * sum on 0–100. Every component is reported back (riskFactors) so the number can be
 * explained in one sentence per factor.
 *
 * | component        | 0 … 1                                         | weight |
 * | ---------------- | --------------------------------------------- | ------ |
 * | openLoad         | open requests / 10 (capped)                   | 0.25   |
 * | slaBreach        | share of SLA-tracked requests that breached   | 0.30   |
 * | criticalShare    | open CRITICAL / open                          | 0.15   |
 * | growth           | (last 30 d − previous 30 d) / max(prev, 3)    | 0.15   |
 * | slowResolution   | avg. resolution time / 7 days (capped)        | 0.15   |
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskInput {
  open: number;
  openCritical: number;
  slaTracked: number;
  slaBreached: number;
  last30: number;
  previous30: number;
  avgResolutionMinutes: number | null;
}

export interface RiskFactor {
  key: 'openLoad' | 'slaBreach' | 'criticalShare' | 'growth' | 'slowResolution';
  label: string;
  /** 0–1 component value. */
  value: number;
  /** Points this factor adds to the 0–100 score. */
  points: number;
  detail: string;
}

export interface RiskResult {
  riskScore: number;
  riskLevel: RiskLevel;
  /** Sorted by contribution, largest first. */
  riskFactors: RiskFactor[];
}

const WEIGHTS: Record<RiskFactor['key'], number> = {
  openLoad: 0.25,
  slaBreach: 0.3,
  criticalShare: 0.15,
  growth: 0.15,
  slowResolution: 0.15,
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `%${Math.round(n * 100)}`;

export function riskLevelOf(score: number): RiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

export function neighborhoodRisk(input: RiskInput): RiskResult {
  const breachRate = input.slaTracked > 0 ? input.slaBreached / input.slaTracked : 0;
  const growth = (input.last30 - input.previous30) / Math.max(input.previous30, 3);
  const hours = input.avgResolutionMinutes === null ? 0 : input.avgResolutionMinutes / 60;
  const components: Omit<RiskFactor, 'points'>[] = [
    {
      key: 'openLoad',
      label: 'Açık talep yoğunluğu',
      value: clamp(input.open / 10),
      detail: `${input.open} açık talep`,
    },
    {
      key: 'slaBreach',
      label: 'SLA aşım oranı',
      value: clamp(breachRate),
      detail:
        input.slaTracked > 0
          ? `${input.slaBreached}/${input.slaTracked} talep SLA'yı aştı (${pct(breachRate)})`
          : 'SLA takibi yapılan talep yok',
    },
    {
      key: 'criticalShare',
      label: 'Kritik talep oranı',
      value: input.open > 0 ? clamp(input.openCritical / input.open) : 0,
      detail: `${input.openCritical} kritik öncelikli açık talep`,
    },
    {
      key: 'growth',
      label: 'Son dönemde artış',
      value: clamp(growth),
      detail: `Son 30 gün ${input.last30}, önceki 30 gün ${input.previous30} talep`,
    },
    {
      key: 'slowResolution',
      label: 'Yavaş çözüm',
      value: clamp(hours / 168),
      detail:
        input.avgResolutionMinutes === null
          ? 'Çözülen talep yok'
          : `Ortalama çözüm ${Math.round(hours)} saat`,
    },
  ];
  const riskFactors = components
    .map((c) => ({ ...c, points: Math.round(c.value * WEIGHTS[c.key] * 1000) / 10 }))
    .sort((a, b) => b.points - a.points);
  const riskScore = Math.round(riskFactors.reduce((sum, f) => sum + f.points, 0));
  return { riskScore, riskLevel: riskLevelOf(riskScore), riskFactors };
}
