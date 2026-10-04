/**
 * Rule-based anomaly detection (Phase 10) – deliberately modest, explainable statistics.
 *
 * For each neighbourhood × category: the last 7 days are compared with the weekly
 * average of the 4 weeks before (days 8–35). An anomaly needs ALL of:
 *   • at least MIN_RECENT reports in the last 7 days (no claims from 1–2 reports);
 *   • at least RATIO × the baseline weekly average;
 *   • at least MIN_EXCESS more reports than the baseline.
 * With an empty baseline the wording says so ("önceki 4 haftada hiç yoktu") instead of
 * printing an infinite percentage.
 */
export const ANOMALY_RULES = { MIN_RECENT: 3, RATIO: 1.5, MIN_EXCESS: 2, BASELINE_WEEKS: 4 };

export interface AnomalyCounts {
  neighborhoodId: string;
  neighborhoodName: string;
  categoryId: string;
  categoryName: string;
  last7: number;
  /** Reports in the 4 weeks before the last 7 days. */
  previous28: number;
}

export interface Anomaly {
  neighborhoodId: string;
  neighborhoodName: string;
  categoryId: string;
  categoryName: string;
  last7: number;
  baselineWeekly: number;
  /** null when the baseline is empty. */
  increasePercent: number | null;
  severity: 'MEDIUM' | 'HIGH';
  message: string;
}

const oneDecimal = (n: number) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(n);

export function detectAnomaly(counts: AnomalyCounts): Anomaly | null {
  const baseline = counts.previous28 / ANOMALY_RULES.BASELINE_WEEKS;
  const { last7 } = counts;
  if (last7 < ANOMALY_RULES.MIN_RECENT) return null;
  if (last7 - baseline < ANOMALY_RULES.MIN_EXCESS) return null;
  if (baseline > 0 && last7 < baseline * ANOMALY_RULES.RATIO) return null;

  const increasePercent = baseline > 0 ? Math.round((last7 / baseline - 1) * 100) : null;
  const severity = baseline === 0 || last7 >= baseline * 2.5 ? 'HIGH' : 'MEDIUM';
  const place = `${counts.neighborhoodName} Mahallesi'nde`;
  const what = `${counts.categoryName.toLocaleLowerCase('tr-TR')} bildirimleri`;
  const message =
    increasePercent === null
      ? `${place} ${what} son 7 günde ${last7} adet; önceki 4 haftada hiç yoktu.`
      : `${place} ${what} son 7 günde normalin %${increasePercent} üzerinde (${last7} bildirim; önceki 4 haftanın haftalık ortalaması ${oneDecimal(baseline)}).`;
  return {
    neighborhoodId: counts.neighborhoodId,
    neighborhoodName: counts.neighborhoodName,
    categoryId: counts.categoryId,
    categoryName: counts.categoryName,
    last7,
    baselineWeekly: Math.round(baseline * 10) / 10,
    increasePercent,
    severity,
    message,
  };
}

/** Anomalies sorted by strength (no-baseline first, then by increase). */
export function detectAnomalies(rows: AnomalyCounts[]): Anomaly[] {
  return rows
    .map(detectAnomaly)
    .filter((a): a is Anomaly => a !== null)
    .sort(
      (a, b) =>
        (b.increasePercent ?? Number.POSITIVE_INFINITY) -
          (a.increasePercent ?? Number.POSITIVE_INFINITY) || b.last7 - a.last7,
    );
}
