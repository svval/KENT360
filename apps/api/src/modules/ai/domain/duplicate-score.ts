/**
 * Duplicate score (ARCHITECTURE §7) – explainable, no LLM involved:
 *
 *   score = 0.35·distance + 0.25·category + 0.25·text + 0.15·time
 *
 *   distance = max(0, 1 − d / 150 m)       (candidates come from ST_DWithin 150 m)
 *   category = 1 same sub-category · 0.6 same parent · 0 otherwise
 *   text     = pg_trgm similarity(description, new text)
 *   time     = max(0, 1 − hours / 168)     (one week)
 *
 * score ≥ 0.60 → POSSIBLE_DUPLICATE. Nothing is merged automatically.
 */
export const DUPLICATE_RULES = {
  RADIUS_METERS: 150,
  MAX_AGE_DAYS: 30,
  THRESHOLD: 0.6,
  /** Matches below this are not shown or stored. */
  MIN_SCORE: 0.35,
  WEIGHTS: { distance: 0.35, category: 0.25, text: 0.25, time: 0.15 },
} as const;

export interface DuplicateInput {
  distanceMeters: number;
  sameCategory: boolean;
  sameParent: boolean;
  textSimilarity: number;
  ageMinutes: number;
}

export interface DuplicateComponents {
  distance: number;
  category: number;
  text: number;
  time: number;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function duplicateScore(input: DuplicateInput): {
  score: number;
  components: DuplicateComponents;
  possibleDuplicate: boolean;
} {
  const components = {
    distance: round2(clamp(1 - input.distanceMeters / DUPLICATE_RULES.RADIUS_METERS)),
    category: input.sameCategory ? 1 : input.sameParent ? 0.6 : 0,
    text: round2(clamp(input.textSimilarity)),
    time: round2(clamp(1 - input.ageMinutes / 60 / 168)),
  };
  const w = DUPLICATE_RULES.WEIGHTS;
  const score = round2(
    w.distance * components.distance +
      w.category * components.category +
      w.text * components.text +
      w.time * components.time,
  );
  return { score, components, possibleDuplicate: score >= DUPLICATE_RULES.THRESHOLD };
}

function ageText(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} dk önce`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} saat önce`;
  return `${Math.round(minutes / 1440)} gün önce`;
}

/** "55 m uzakta · aynı kategori · 3 saat önce · metin %88 benzer". */
export function duplicateExplanation(input: DuplicateInput): string {
  return [
    `${Math.round(input.distanceMeters)} m uzakta`,
    input.sameCategory ? 'aynı kategori' : input.sameParent ? 'benzer kategori' : 'farklı kategori',
    ageText(input.ageMinutes),
    `metin %${Math.round(clamp(input.textSimilarity) * 100)} benzer`,
  ].join(' · ');
}
