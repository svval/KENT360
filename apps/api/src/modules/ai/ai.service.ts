import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AiProvider, AI_PROVIDER, type AnalyzeInput } from './ai-provider';
import { type Classification } from './domain/keyword-classifier';
import { MockAiProvider } from './mock-ai.provider';

export interface ProviderResult {
  classification: Classification;
  provider: string;
  model: string;
  fallback: boolean;
  latencyMs: number;
}

/**
 * Runs the configured provider and never lets AI break request handling: any error,
 * refusal or timeout falls back to the deterministic mock, and the result says so.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly mock = new MockAiProvider();

  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  get providerName(): string {
    return this.provider.name;
  }

  async analyze(input: AnalyzeInput): Promise<ProviderResult> {
    const started = performance.now();
    try {
      const classification = await this.provider.analyzeRequest(input);
      return {
        classification,
        provider: this.provider.name,
        model: this.provider.model,
        fallback: false,
        latencyMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      // Only the error class is logged – never the description.
      this.logger.warn(
        { provider: this.provider.name, error: error instanceof Error ? error.name : 'Unknown' },
        'AI provider failed; using the rule-based fallback',
      );
      const classification = await this.mock.analyzeRequest(input);
      return {
        classification,
        provider: this.mock.name,
        model: this.mock.model,
        fallback: true,
        latencyMs: Math.round(performance.now() - started),
      };
    }
  }
}
