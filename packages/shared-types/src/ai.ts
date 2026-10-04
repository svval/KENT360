import { type Priority, type RequestStatus } from './enums';

// ─── AI analysis & duplicates (Phase 11) ─────────────────────────────────────

/** A suggestion only – people decide (ARCHITECTURE §8). */
export interface AiSuggestion {
  category: { id: string; name: string; parent: { id: string; name: string } | null } | null;
  department: { id: string; name: string } | null;
  priority: Priority;
  /** 0–1. */
  confidence: number;
  /** Short explanation shown with the suggestion. */
  reasoning: string;
  summary: string;
}

export interface DuplicateCandidate {
  requestId: string;
  publicNumber: string;
  categoryName: string | null;
  status: RequestStatus;
  distanceMeters: number;
  ageMinutes: number;
  /** 0–1 (distance 0.35 · category 0.25 · text 0.25 · time 0.15). */
  score: number;
  components: { distance: number; category: number; text: number; time: number };
  /** "55 m uzakta · aynı kategori · 3 saat önce · metin %88 benzer". */
  explanation: string;
  /** score ≥ 0.60. */
  possibleDuplicate: boolean;
  supporterCount: number;
  /** The user may open the request detail (in their scope). */
  canView: boolean;
}

export interface RequestAnalysisResult {
  provider: string;
  model: string;
  /** The configured provider failed or is not configured; the rule-based one answered. */
  fallback: boolean;
  suggestion: AiSuggestion;
  possibleDuplicates: DuplicateCandidate[];
  analyzedAt: string;
}

/** Stored analysis of a request (staff only). */
export interface RequestAiAnalysis {
  id: string;
  provider: string;
  model: string;
  category: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  priority: Priority | null;
  confidence: number;
  summary: string | null;
  reasoning: string | null;
  /** The request was filed with the suggested category. */
  accepted: boolean | null;
  latencyMs: number | null;
  createdAt: string;
  duplicates: {
    requestId: string;
    publicNumber: string;
    score: number;
    distanceMeters: number;
    status: 'SUGGESTED' | 'CONFIRMED' | 'DISMISSED';
  }[];
}
