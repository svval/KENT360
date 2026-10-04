import { type Priority } from '@kent360/shared-types';

/**
 * The deterministic classifier behind MockAIProvider (ARCHITECTURE §8): category by the
 * category `keywords`, priority by explicit danger words. Every decision is traceable
 * to the words that caused it, so the "AI önerisi" can be explained and tested.
 */
export interface CategoryOption {
  code: string;
  name: string;
  parentName: string | null;
  keywords: string[];
  parentKeywords: string[];
  defaultPriority: Priority;
}

export interface Classification {
  categoryCode: string | null;
  priority: Priority;
  /** 0–1. */
  confidence: number;
  matchedKeywords: string[];
  reasoning: string;
  summary: string;
}

/** Words that raise the priority (danger to people). */
const CRITICAL_WORDS = ['yaralan', 'kaza', 'gaz kaçağı', 'elektrik çarp', 'çöktü', 'yangın'];
const HIGH_WORDS = ['tehlike', 'acil', 'çocuk', 'okul', 'düşüyor', 'düştü', 'kopmuş', 'kırık'];

const normalise = (text: string) => text.toLocaleLowerCase('tr-TR');

/** Matches a keyword at a word start ("çukur" matches "çukuru", not "uçukur"). */
function contains(text: string, keyword: string): boolean {
  const k = normalise(keyword).trim();
  if (!k) return false;
  let from = 0;
  for (;;) {
    const index = text.indexOf(k, from);
    if (index < 0) return false;
    const before = index === 0 ? ' ' : text[index - 1];
    if (!/[\p{L}\p{N}]/u.test(before)) return true;
    from = index + 1;
  }
}

const RANK: Record<Priority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 };

export function summarise(description: string): string {
  const clean = description.replace(/\s+/g, ' ').trim();
  const sentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
}

export function classifyByKeywords(
  description: string,
  categories: readonly CategoryOption[],
): Classification {
  const text = normalise(description);
  let best: { option: CategoryOption; hits: string[]; score: number } | null = null;
  let second = 0;
  for (const option of categories) {
    const own = option.keywords.filter((k) => contains(text, k));
    const parent = option.parentKeywords.filter((k) => contains(text, k) && !own.includes(k));
    // Own keywords count fully, the parent's half (they only tell the group).
    const score = own.length + parent.length * 0.5;
    if (score === 0) continue;
    if (!best || score > best.score) {
      second = best?.score ?? second;
      best = { option, hits: [...own, ...parent], score };
    } else if (score > second) {
      second = score;
    }
  }

  const danger = CRITICAL_WORDS.filter((w) => contains(text, w));
  const caution = HIGH_WORDS.filter((w) => contains(text, w));
  let priority: Priority = best?.option.defaultPriority ?? 'NORMAL';
  if (danger.length > 0) priority = 'CRITICAL';
  else if (caution.length > 0 && RANK[priority] < RANK.HIGH) priority = 'HIGH';

  if (!best) {
    return {
      categoryCode: null,
      priority,
      confidence: 0.2,
      matchedKeywords: [],
      reasoning:
        'Açıklamada kategori anahtar kelimelerinden hiçbiri geçmiyor; kategoriyi siz seçin.',
      summary: summarise(description),
    };
  }
  // More distinct matches → higher confidence; a close runner-up lowers it.
  const margin = best.score - second;
  const confidence = Math.min(0.95, 0.5 + 0.12 * best.score + (margin >= 1 ? 0.1 : 0));
  const path = best.option.parentName
    ? `${best.option.parentName} › ${best.option.name}`
    : best.option.name;
  const words = best.hits.map((h) => `“${h}”`).join(', ');
  const priorityNote =
    danger.length > 0
      ? ` Risk ifadesi (${danger.join(', ')}) nedeniyle öncelik kritik.`
      : caution.length > 0
        ? ` Dikkat ifadesi (${caution.join(', ')}) nedeniyle öncelik yükseltildi.`
        : '';
  return {
    categoryCode: best.option.code,
    priority,
    confidence: Math.round(confidence * 100) / 100,
    matchedKeywords: best.hits,
    reasoning: `Açıklamada ${words} geçiyor → ${path}.${priorityNote}`,
    summary: summarise(description),
  };
}
