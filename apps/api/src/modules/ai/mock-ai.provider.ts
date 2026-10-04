import { type Priority } from '@kent360/shared-types';
import { type AiProvider, type AnalyzeInput } from './ai-provider';
import { type Classification, classifyByKeywords, summarise } from './domain/keyword-classifier';

/**
 * Default provider: the deterministic keyword classifier. No network, no API key, same
 * answer every time – development, demos, tests, and the fallback of real providers.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'keyword-rules-v1';

  analyzeRequest(input: AnalyzeInput): Promise<Classification> {
    return Promise.resolve(classifyByKeywords(input.description, input.categories));
  }

  async suggestCategory(input: AnalyzeInput) {
    const { categoryCode, confidence } = await this.analyzeRequest(input);
    return { categoryCode, confidence };
  }

  async suggestPriority(input: AnalyzeInput): Promise<Priority> {
    return (await this.analyzeRequest(input)).priority;
  }

  summarize(description: string): Promise<string> {
    return Promise.resolve(summarise(description));
  }
}
