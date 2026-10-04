import { type Priority } from '@kent360/shared-types';
import { type CategoryOption, type Classification } from './domain/keyword-classifier';

/**
 * AI provider abstraction (ARCHITECTURE §8). Providers only SUGGEST; the API maps the
 * suggestion to tenant records and people decide. Input is the (PII-masked)
 * description and the category catalogue – never names, contacts or coordinates.
 */
export interface AnalyzeInput {
  /** Already passed through maskPersonalData(). */
  description: string;
  categories: readonly CategoryOption[];
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Category, priority, confidence, reasoning and summary in one call. */
  analyzeRequest(input: AnalyzeInput): Promise<Classification>;
  suggestCategory(
    input: AnalyzeInput,
  ): Promise<{ categoryCode: string | null; confidence: number }>;
  suggestPriority(input: AnalyzeInput): Promise<Priority>;
  summarize(description: string): Promise<string>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
