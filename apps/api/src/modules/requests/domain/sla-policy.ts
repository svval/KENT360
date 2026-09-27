/** Default share of the SLA window that counts as "at risk" (ARCHITECTURE §6.3). */
export const DEFAULT_SLA_AT_RISK_RATIO = 0.25;

/**
 * Municipality setting `settings.slaAtRiskRatio` (0 < ratio < 1); falls back to 25 %
 * when missing or out of range.
 */
export function atRiskRatioFrom(settings: unknown): number {
  const value = (settings as { slaAtRiskRatio?: unknown } | null)?.slaAtRiskRatio;
  return typeof value === 'number' && value > 0 && value < 1 ? value : DEFAULT_SLA_AT_RISK_RATIO;
}

export interface SlaSnapshotTimes {
  slaDueAt: Date;
  slaAtRiskAt: Date;
}

/**
 * The SLA snapshot written once, at creation:
 *   slaDueAt    = createdAt + effective category SLA
 *   slaAtRiskAt = slaDueAt − ratio × SLA duration  (the last 25 % of the window by default)
 * Later category or setting changes never touch existing requests; neither does a
 * department re-assignment.
 */
export function slaSnapshot(
  createdAt: Date,
  effectiveSlaMinutes: number | null,
  atRiskRatio: number,
): SlaSnapshotTimes | null {
  if (effectiveSlaMinutes === null || effectiveSlaMinutes <= 0) return null;
  const durationMs = effectiveSlaMinutes * 60_000;
  const slaDueAt = new Date(createdAt.getTime() + durationMs);
  const slaAtRiskAt = new Date(slaDueAt.getTime() - Math.round(durationMs * atRiskRatio));
  return { slaDueAt, slaAtRiskAt };
}
